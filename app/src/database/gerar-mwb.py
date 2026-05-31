#!/usr/bin/env python3
"""
Gera safety_intelligence.mwb (MySQL Workbench) a partir do schema unificado.

Uso:
  python gerar-mwb.py
"""

import re
import subprocess
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "safety_intelligence.mwb"
BUILD = ROOT / "_mwb_build_out"
TEMPLATE_XML = ROOT / "_mwb_ref" / "document.mwb.xml"
TEMPLATE_MWB = ROOT / "_mwb_ref" / "template.mwb"
MYSQL = r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"

DB = {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "sptech",
    "database": "safety_intelligence",
}

TABLES_FILTER = [
    "unidade_federativa",
    "usuario",
    "lista_favoritos",
    "configuracoes_usuario",
    "municipio",
    "populacao_municipio",
    "indicador_seguranca",
    "ocorrencia_seguranca",
    "log_sistema",
]


def new_id():
    return "{" + str(uuid.uuid4()).upper() + "}"


def mysql_query(sql):
    cmd = [
        MYSQL,
        f"-h{DB['host']}",
        f"-P{DB['port']}",
        f"-u{DB['user']}",
        f"-p{DB['password']}",
        DB["database"],
        "-N",
        "-B",
        "-e",
        sql,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Falha ao consultar MySQL")
    return result.stdout.strip()


def load_schema():
    sql = """
    SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE,
           COLUMN_KEY, EXTRA, COLUMN_DEFAULT
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ({tables})
    ORDER BY TABLE_NAME, ORDINAL_POSITION;
    """.format(
        tables=",".join("'" + t + "'" for t in TABLES_FILTER)
    )
    raw = mysql_query(sql)
    tables = {}
    if raw:
        for line in raw.splitlines():
            parts = line.split("\t")
            if len(parts) < 8:
                continue
            tname, cname, _, ctype, nullable, colkey, extra, default = parts[:8]
            tables.setdefault(tname, {"columns": [], "fks": []})
            tables[tname]["columns"].append(
                {
                    "name": cname,
                    "type": ctype,
                    "nullable": nullable == "YES",
                    "key": colkey,
                    "extra": extra,
                    "default": default if default != "NULL" else None,
                }
            )

    fk_sql = """
    SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME IS NOT NULL
      AND TABLE_NAME IN ({tables});
    """.format(
        tables=",".join("'" + t + "'" for t in TABLES_FILTER)
    )
    fk_raw = mysql_query(fk_sql)
    if fk_raw:
        for line in fk_raw.splitlines():
            tname, cname, ref_table, ref_col, cname_fk = line.split("\t")
            if tname in tables:
                tables[tname]["fks"].append(
                    {
                        "column": cname,
                        "ref_table": ref_table,
                        "ref_column": ref_col,
                        "name": cname_fk,
                    }
                )

    idx_sql = """
    SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, COLLATION
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ({tables})
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
    """.format(
        tables=",".join("'" + t + "'" for t in TABLES_FILTER)
    )
    idx_raw = mysql_query(idx_sql)
    for t in tables.values():
        t["indexes"] = {}
    if idx_raw:
        for line in idx_raw.splitlines():
            tname, iname, non_unique, _, col, collation = line.split("\t")
            if tname not in tables:
                continue
            idx = tables[tname]["indexes"].setdefault(
                iname,
                {
                    "name": iname,
                    "unique": non_unique == "0",
                    "primary": iname == "PRIMARY",
                    "columns": [],
                },
            )
            idx["columns"].append(
                {"name": col, "desc": collation == "D"}
            )

    ordered = []
    for name in TABLES_FILTER:
        if name in tables:
            ordered.append((name, tables[name]))
    if not ordered:
        raise RuntimeError("Nenhuma tabela encontrada no banco.")
    return ordered


def map_datatype(column_type):
    t = column_type.lower()
    if t.startswith("int"):
        return "com.mysql.rdbms.mysql.datatype.int", -1, -1, -1
    if t.startswith("bigint"):
        return "com.mysql.rdbms.mysql.datatype.bigint", -1, -1, -1
    if t.startswith("tinyint"):
        return "com.mysql.rdbms.mysql.datatype.tinyint", -1, -1, -1
    if t.startswith("double"):
        return "com.mysql.rdbms.mysql.datatype.double", -1, -1, -1
    if t.startswith("decimal"):
        inside = t[t.find("(") + 1 : t.find(")")]
        if inside:
            p, s = inside.split(",")
            return "com.mysql.rdbms.mysql.datatype.decimal", -1, int(p), int(s)
        return "com.mysql.rdbms.mysql.datatype.decimal", -1, 10, 0
    if t.startswith("varchar"):
        n = int(t[t.find("(") + 1 : t.find(")")])
        return "com.mysql.rdbms.mysql.datatype.varchar", n, -1, -1
    if t.startswith("char"):
        n = int(t[t.find("(") + 1 : t.find(")")])
        return "com.mysql.rdbms.mysql.datatype.char", n, -1, -1
    if t.startswith("datetime"):
        return "com.mysql.rdbms.mysql.datatype.datetime", -1, -1, -1
    if t.startswith("text"):
        return "com.mysql.rdbms.mysql.datatype.text", -1, -1, -1
    return "com.mysql.rdbms.mysql.datatype.varchar", 255, -1, -1


class MwbBuilder:
    def __init__(self):
        self.schema_id = new_id()
        self.diagram_id = new_id()
        self.layer_id = new_id()
        self.catalog_id = None
        self.physical_id = None
        self.table_ids = {}
        self.column_ids = {}
        self.index_ids = {}
        self.figure_ids = {}
        self.fk_index_ids = {}
        self.fk_object_ids = {}
        self.schema_dict = {}

    def col_xml(self, table_id, col):
        cid = new_id()
        self.column_ids[(col["table"], col["name"])] = cid
        dtype, length, precision, scale = map_datatype(col["type"])
        auto_inc = 1 if "auto_increment" in col.get("extra", "").lower() else 0
        default = col.get("default")
        default_is_null = 1 if default is None else 0
        default_val = "" if default is None else escape(str(default))
        return f"""
                    <value type="object" struct-name="db.mysql.Column" id="{cid}" struct-checksum="0x0">
                      <value type="int" key="autoIncrement">{auto_inc}</value>
                      <value type="string" key="expression"></value>
                      <value type="int" key="generated">0</value>
                      <value type="string" key="generatedStorage"></value>
                      <value type="string" key="characterSetName"></value>
                      <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.CheckConstraint" key="checks"/>
                      <value type="string" key="collationName"></value>
                      <value type="string" key="datatypeExplicitParams"></value>
                      <value type="string" key="defaultValue">{default_val}</value>
                      <value type="int" key="defaultValueIsNull">{default_is_null}</value>
                      <value _ptr_="0x0" type="list" content-type="string" key="flags"/>
                      <value type="int" key="isNotNull">{0 if col['nullable'] else 1}</value>
                      <value type="int" key="length">{length}</value>
                      <value type="int" key="precision">{precision}</value>
                      <value type="int" key="scale">{scale}</value>
                      <link type="object" struct-name="db.SimpleDatatype" key="simpleType">{dtype}</link>
                      <value type="string" key="comment"></value>
                      <value type="string" key="name">{escape(col['name'])}</value>
                      <value type="string" key="oldName"></value>
                      <link type="object" struct-name="GrtObject" key="owner">{table_id}</link>
                    </value>"""

    def index_col_xml(self, index_id, col_name, descend, table_name):
        icid = new_id()
        col_id = self.column_ids[(table_name, col_name)]
        return f"""
                        <value type="object" struct-name="db.mysql.IndexColumn" id="{icid}" struct-checksum="0x0">
                          <value type="int" key="columnLength">0</value>
                          <value type="string" key="comment"></value>
                          <value type="int" key="descend">{1 if descend else 0}</value>
                          <value type="string" key="expression"></value>
                          <link type="object" struct-name="db.Column" key="referencedColumn">{col_id}</link>
                          <value type="string" key="name"></value>
                          <link type="object" struct-name="GrtObject" key="owner">{index_id}</link>
                        </value>"""

    def index_xml(self, table_id, table_name, index):
        iid = new_id()
        self.index_ids[(table_name, index["name"])] = iid
        cols = "".join(
            self.index_col_xml(iid, c["name"], c["desc"], table_name)
            for c in index["columns"]
        )
        index_type = "PRIMARY" if index["primary"] else ("UNIQUE" if index["unique"] else "INDEX")
        is_primary = 1 if index["primary"] else 0
        return f"""
                    <value type="object" struct-name="db.mysql.Index" id="{iid}" struct-checksum="0x0">
                      <value type="string" key="algorithm"></value>
                      <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.IndexColumn" key="columns">{cols}
                      </value>
                      <value type="string" key="indexKind"></value>
                      <value type="int" key="keyBlockSize">0</value>
                      <value type="string" key="lockOption"></value>
                      <value type="int" key="visible">1</value>
                      <value type="string" key="withParser"></value>
                      <value type="string" key="comment"></value>
                      <value type="int" key="deferability">0</value>
                      <value type="string" key="indexType">{index_type}</value>
                      <value type="int" key="isPrimary">{is_primary}</value>
                      <value type="string" key="name">{escape(index['name'])}</value>
                      <value type="int" key="unique">{1 if index['unique'] and not index['primary'] else 0}</value>
                      <value type="int" key="commentedOut">0</value>
                      <value type="string" key="createDate"></value>
                      <value _ptr_="0x0" type="dict" key="customData"/>
                      <value type="string" key="lastChangeDate"></value>
                      <value type="int" key="modelOnly">0</value>
                      <link type="object" struct-name="GrtNamedObject" key="owner">{table_id}</link>
                      <value type="string" key="temp_sql"></value>
                      <value type="string" key="oldName">{escape(index['name'])}</value>
                    </value>"""

    def fk_xml(self, table_id, table_name, fk):
        fkid = new_id()
        col_id = self.column_ids[(table_name, fk["column"])]
        ref_table_id = self.table_ids[fk["ref_table"]]
        ref_col_id = self.column_ids[(fk["ref_table"], fk["ref_column"])]
        idx_key = (table_name, fk["column"])
        if idx_key not in self.fk_index_ids:
            for iname, idx in self.schema_dict[table_name]["indexes"].items():
                cols = [c["name"] for c in idx["columns"]]
                if cols and cols[0] == fk["column"] and not idx["primary"]:
                    self.fk_index_ids[idx_key] = self.index_ids[(table_name, iname)]
                    break
            if idx_key not in self.fk_index_ids:
                for iname, idx in self.schema_dict[table_name]["indexes"].items():
                    cols = [c["name"] for c in idx["columns"]]
                    if fk["column"] in cols and not idx["primary"]:
                        self.fk_index_ids[idx_key] = self.index_ids[(table_name, iname)]
                        break
        index_id = self.fk_index_ids.get(
            idx_key, self.index_ids.get((table_name, "PRIMARY"))
        )
        self.fk_object_ids[(table_name, fk["name"])] = fkid
        return f"""
                    <value type="object" struct-name="db.mysql.ForeignKey" id="{fkid}" struct-checksum="0x0">
                      <link type="object" struct-name="db.mysql.Table" key="referencedTable">{ref_table_id}</link>
                      <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.Column" key="columns">
                        <link type="object">{col_id}</link>
                      </value>
                      <value _ptr_="0x0" type="dict" key="customData"/>
                      <value type="int" key="deferability">0</value>
                      <value type="string" key="deleteRule">NO ACTION</value>
                      <link type="object" struct-name="db.Index" key="index">{index_id}</link>
                      <value type="int" key="mandatory">1</value>
                      <value type="int" key="many">1</value>
                      <value type="int" key="modelOnly">0</value>
                      <link type="object" struct-name="db.Table" key="owner">{table_id}</link>
                      <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.Column" key="referencedColumns">
                        <link type="object">{ref_col_id}</link>
                      </value>
                      <value type="int" key="referencedMandatory">0</value>
                      <value type="string" key="updateRule">NO ACTION</value>
                      <value type="string" key="comment"></value>
                      <value type="string" key="name">{escape(fk['name'])}</value>
                      <value type="string" key="oldName">{escape(fk['name'])}</value>
                    </value>"""

    def table_xml(self, name, meta):
        tid = new_id()
        self.table_ids[name] = tid
        cols = []
        for col in meta["columns"]:
            c = dict(col)
            c["table"] = name
            cols.append(self.col_xml(tid, c))
        cols_xml = "".join(cols)
        indexes = "".join(
            self.index_xml(tid, name, idx) for idx in meta["indexes"].values()
        )
        fks = "".join(self.fk_xml(tid, name, fk) for fk in meta["fks"])
        pk_link = ""
        for idx in meta["indexes"].values():
            if idx["primary"]:
                pk_link = self.index_ids[(name, idx["name"])]
                break
        return f"""
                <value type="object" struct-name="db.mysql.Table" id="{tid}" struct-checksum="0x0">
                  <value type="string" key="avgRowLength"></value>
                  <value type="int" key="checksum">0</value>
                  <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.Column" key="columns">{cols_xml}
                  </value>
                  <value type="string" key="connectionString"></value>
                  <value type="string" key="defaultCharacterSetName">utf8mb4</value>
                  <value type="string" key="defaultCollationName">utf8mb4_general_ci</value>
                  <value type="int" key="delayKeyWrite">0</value>
                  <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.ForeignKey" key="foreignKeys">{fks}
                  </value>
                  <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.Index" key="indices">{indexes}
                  </value>
                  <value type="string" key="keyBlockSize"></value>
                  <value type="string" key="maxRows"></value>
                  <value type="string" key="mergeInsert"></value>
                  <value type="string" key="mergeUnion"></value>
                  <value type="string" key="minRows"></value>
                  <value type="string" key="nextAutoInc"></value>
                  <value type="string" key="packKeys"></value>
                  <value type="int" key="partitionCount">0</value>
                  <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.PartitionDefinition" key="partitionDefinitions"/>
                  <value type="string" key="partitionExpression"></value>
                  <value type="int" key="partitionKeyAlgorithm">0</value>
                  <value type="string" key="partitionType"></value>
                  <value type="string" key="password"></value>
                  <link type="object" struct-name="db.mysql.Index" key="primaryKey">{pk_link}</link>
                  <value type="string" key="raidChunkSize"></value>
                  <value type="string" key="raidChunks"></value>
                  <value type="string" key="raidType"></value>
                  <value type="string" key="rowFormat"></value>
                  <value type="string" key="statsAutoRecalc"></value>
                  <value type="string" key="statsPersistent"></value>
                  <value type="int" key="statsSamplePages">0</value>
                  <value type="int" key="subpartitionCount">0</value>
                  <value type="string" key="subpartitionExpression"></value>
                  <value type="int" key="subpartitionKeyAlgorithm">0</value>
                  <value type="string" key="subpartitionType"></value>
                  <value type="string" key="tableDataDir"></value>
                  <value type="string" key="tableEngine">InnoDB</value>
                  <value type="string" key="tableIndexDir"></value>
                  <value type="string" key="tableSpace"></value>
                  <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.Trigger" key="triggers"/>
                  <value type="int" key="isStub">0</value>
                  <value type="int" key="isSystem">0</value>
                  <value type="int" key="isTemporary">0</value>
                  <value type="string" key="temporaryScope"></value>
                  <value type="int" key="commentedOut">0</value>
                  <value type="string" key="createDate">{datetime.now():%Y-%m-%d %H:%M}</value>
                  <value _ptr_="0x0" type="dict" key="customData"/>
                  <value type="string" key="lastChangeDate">{datetime.now():%Y-%m-%d %H:%M}</value>
                  <value type="int" key="modelOnly">0</value>
                  <value type="string" key="name">{escape(name)}</value>
                  <link type="object" struct-name="GrtNamedObject" key="owner">{self.schema_id}</link>
                  <value type="string" key="temp_sql"></value>
                  <value type="string" key="comment"></value>
                  <value type="string" key="oldName"></value>
                </value>"""

    def figure_xml(self, table_name, left, top, width, height):
        fid = new_id()
        self.figure_ids[table_name] = fid
        tid = self.table_ids[table_name]
        return f"""
              <value type="object" struct-name="workbench.physical.TableFigure" id="{fid}" struct-checksum="0x0">
                <value type="int" key="columnsExpanded">1</value>
                <value type="int" key="foreignKeysExpanded">1</value>
                <value type="int" key="indicesExpanded">0</value>
                <value type="int" key="summarizeDisplay">-1</value>
                <link type="object" struct-name="db.Table" key="table">{tid}</link>
                <value type="int" key="triggersExpanded">0</value>
                <value type="string" key="color">#98BFDA</value>
                <value type="int" key="expanded">1</value>
                <value type="real" key="height">{height}</value>
                <link type="object" struct-name="model.Layer" key="layer">{self.layer_id}</link>
                <value type="real" key="left">{left}</value>
                <value type="int" key="locked">0</value>
                <value type="int" key="manualSizing">0</value>
                <value type="real" key="top">{top}</value>
                <value type="real" key="width">{width}</value>
                <link type="object" struct-name="model.Diagram" key="owner">{self.diagram_id}</link>
                <value type="int" key="visible">1</value>
                <value type="string" key="name">{escape(table_name)}</value>
              </value>"""

    def connection_xml(self, table_name, fk):
        cid = new_id()
        fkid = self.fk_object_ids[(table_name, fk["name"])]
        start_figure = self.figure_ids[table_name]
        end_figure = self.figure_ids[fk["ref_table"]]
        return f"""
              <value type="object" struct-name="workbench.physical.Connection" id="{cid}" struct-checksum="0x9baebc92">
                <value type="string" key="caption">{escape(fk['name'])}</value>
                <value type="real" key="captionXOffs">0</value>
                <value type="real" key="captionYOffs">0</value>
                <value type="string" key="comment"></value>
                <value type="real" key="endCaptionXOffs">0</value>
                <value type="real" key="endCaptionYOffs">0</value>
                <value type="string" key="extraCaption"></value>
                <value type="real" key="extraCaptionXOffs">0</value>
                <value type="real" key="extraCaptionYOffs">0</value>
                <link type="object" struct-name="db.ForeignKey" key="foreignKey">{fkid}</link>
                <value type="real" key="middleSegmentOffset">0</value>
                <value type="real" key="startCaptionXOffs">0</value>
                <value type="real" key="startCaptionYOffs">0</value>
                <value type="int" key="drawSplit">0</value>
                <link type="object" struct-name="model.Figure" key="endFigure">{end_figure}</link>
                <link type="object" struct-name="model.Figure" key="startFigure">{start_figure}</link>
                <link type="object" struct-name="model.Diagram" key="owner">{self.diagram_id}</link>
                <value type="int" key="visible">1</value>
                <value type="string" key="name"></value>
              </value>"""

    def build_schema_xml(self, schema_list):
        tables_xml = "".join(self.table_xml(n, m) for n, m in schema_list)
        return f"""
            <value type="object" struct-name="db.mysql.Schema" id="{self.schema_id}" struct-checksum="0x20b94c22">
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.RoutineGroup" key="routineGroups"/>
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.Routine" key="routines"/>
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.Sequence" key="sequences"/>
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.StructuredDatatype" key="structuredTypes"/>
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.Synonym" key="synonyms"/>
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.Table" key="tables">{tables_xml}
              </value>
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="db.mysql.View" key="views"/>
              <value type="string" key="defaultCharacterSetName">utf8mb4</value>
              <value type="string" key="defaultCollationName">utf8mb4_general_ci</value>
              <value type="string" key="name">safety_intelligence</value>
              <link type="object" struct-name="GrtNamedObject" key="owner">{self.catalog_id}</link>
              <value type="string" key="comment"></value>
              <value type="string" key="oldName"></value>
            </value>"""

    def build_diagram_xml(self, schema_list):
        layout = [
            ("unidade_federativa", 40, 40, 170, 90),
            ("usuario", 280, 40, 170, 110),
            ("configuracoes_usuario", 520, 40, 210, 180),
            ("lista_favoritos", 280, 200, 210, 160),
            ("municipio", 40, 200, 190, 150),
            ("populacao_municipio", 40, 400, 210, 120),
            ("indicador_seguranca", 300, 400, 190, 120),
            ("ocorrencia_seguranca", 530, 200, 220, 150),
            ("log_sistema", 530, 400, 170, 110),
        ]
        figures = []
        figure_links = []
        for name, left, top, width, height in layout:
            if name in self.table_ids:
                figures.append(self.figure_xml(name, left, top, width, height))
                figure_links.append(
                    f"                <link type=\"object\">{self.figure_ids[name]}</link>"
                )
        connections = []
        for table_name, meta in schema_list:
            for fk in meta["fks"]:
                connections.append(self.connection_xml(table_name, fk))
        connections_xml = "".join(connections)
        figures_xml = "".join(figures)
        figure_links_xml = "\n".join(figure_links)
        return f"""
          <value type="object" struct-name="workbench.physical.Diagram" id="{self.diagram_id}" struct-checksum="0x232c2434">
            <value type="int" key="closed">0</value>
            <value _ptr_="0x0" type="list" content-type="object" content-struct-name="model.Connection" key="connections">{connections_xml}
            </value>
            <value type="string" key="description">DER Safety Intelligence</value>
            <value _ptr_="0x0" type="list" content-type="object" content-struct-name="model.Figure" key="figures">{figures_xml}
            </value>
            <value type="real" key="height">600</value>
            <value _ptr_="0x0" type="list" content-type="object" content-struct-name="model.Layer" key="layers"/>
            <value type="string" key="name">EER Diagram</value>
            <value _ptr_="0x0" type="dict" key="options"/>
            <link type="object" struct-name="model.Model" key="owner">{self.physical_id}</link>
            <value type="object" struct-name="workbench.physical.Layer" id="{self.layer_id}" struct-checksum="0x1d14ca4b" key="rootLayer">
              <value type="string" key="color"></value>
              <value type="string" key="description"></value>
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="model.Figure" key="figures">
{figure_links_xml}
              </value>
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="model.Group" key="groups"/>
              <value type="real" key="height">600</value>
              <value type="real" key="left">0</value>
              <value _ptr_="0x0" type="list" content-type="object" content-struct-name="model.Layer" key="subLayers"/>
              <value type="real" key="top">0</value>
              <value type="real" key="width">900</value>
              <link type="object" struct-name="model.Diagram" key="owner">{self.diagram_id}</link>
              <value type="int" key="visible">1</value>
              <value type="string" key="name"></value>
            </value>
            <value _ptr_="0x0" type="list" content-type="object" content-struct-name="model.Object" key="selection"/>
            <value type="int" key="updateBlocked">0</value>
            <value type="real" key="width">900</value>
            <value type="real" key="x">0</value>
            <value type="real" key="y">0</value>
            <value type="real" key="zoom">1</value>
          </value>"""

    def prepare(self, schema_list):
        self.schema_dict = {n: m for n, m in schema_list}
        for name, meta in schema_list:
            self.table_xml(name, meta)


def ensure_template():
    TEMPLATE_MWB.parent.mkdir(parents=True, exist_ok=True)
    if not TEMPLATE_XML.exists():
        if not TEMPLATE_MWB.exists():
            import urllib.request

            urllib.request.urlretrieve(
                "https://raw.githubusercontent.com/mysql-workbench-schema-exporter/"
                "mysql-workbench-schema-exporter/master/example/data/test.mwb",
                TEMPLATE_MWB,
            )
        with zipfile.ZipFile(TEMPLATE_MWB, "r") as zf:
            zf.extract("document.mwb.xml", TEMPLATE_MWB.parent)
            extracted = TEMPLATE_MWB.parent / "document.mwb.xml"
            extracted.replace(TEMPLATE_XML)


def merge_with_template(template_xml, builder, schema_list):
    catalog_match = re.search(
        r'struct-name="db\.mysql\.Catalog" id="(\{[^}]+\})"', template_xml
    )
    physical_match = re.search(
        r'struct-name="workbench\.physical\.Model" id="(\{[^}]+\})"', template_xml
    )
    if not catalog_match or not physical_match:
        raise RuntimeError("Template MWB inválido.")
    builder.catalog_id = catalog_match.group(1)
    builder.physical_id = physical_match.group(1)
    builder.prepare(schema_list)

    schema_xml = builder.build_schema_xml(schema_list)
    diagram_xml = builder.build_diagram_xml(schema_list)
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    xml = re.sub(
        r'(<value _ptr_="[^"]*" type="list" content-type="object" '
        r'content-struct-name="db\.mysql\.Schema" key="schemata">).*?'
        r'(</value>\s*<value _ptr_="[^"]*" type="list" content-type="object" '
        r'content-struct-name="db\.mysql\.ServerLink" key="serverLinks"/>)',
        r"\1" + schema_xml + r"\n          \2",
        template_xml,
        count=1,
        flags=re.DOTALL,
    )
    xml = re.sub(
        r'(<link type="object" struct-name="db\.Schema" key="defaultSchema">)(\{[^}]+\})',
        r"\g<1>" + builder.schema_id,
        xml,
        count=1,
    )
    xml = re.sub(
        r'(<value _ptr_="[^"]*" type="list" content-type="object" '
        r'content-struct-name="workbench\.physical\.Diagram" key="diagrams">).*?'
        r'(</value>\s*<value type="string" key="figureNotation">)',
        r"\1" + diagram_xml + r"\n        \2",
        xml,
        count=1,
        flags=re.DOTALL,
    )
    xml = re.sub(
        r'(<link type="object" struct-name="model\.Diagram" key="currentDiagram">)(\{[^}]+\})',
        r"\g<1>" + builder.diagram_id,
        xml,
        count=1,
    )

    doc_info = f"""    <value type="object" struct-name="app.DocumentInfo" id="{new_id()}" struct-checksum="0xbba780b8" key="info">
      <value type="string" key="author">Safety Intelligence</value>
      <value type="string" key="caption">safety_intelligence</value>
      <value type="string" key="dateChanged">{now}</value>
      <value type="string" key="dateCreated">{now}</value>
      <value type="string" key="description">DER gerado a partir do script-tabelas.sql</value>
      <value type="string" key="project">Safety Intelligence</value>
      <value type="string" key="version">1.0</value>
      <value type="string" key="name">Properties</value>
      <link type="object" struct-name="GrtObject" key="owner">{{309F3B23-2C8E-495D-8ACD-EE0222DE6758}}</link>
    </value>"""
    xml = re.sub(
        r'<value type="object" struct-name="app\.DocumentInfo" id="\{[^}]+\}"[^>]* key="info">.*?</value>\s*'
        r'(?=<value type="object" struct-name="app\.PageSettings")',
        doc_info + "\n    ",
        xml,
        count=1,
        flags=re.DOTALL,
    )
    return xml


def write_mwb(xml_content):
    BUILD.mkdir(parents=True, exist_ok=True)
    xml_path = BUILD / "document.mwb.xml"
    xml_path.write_text(xml_content, encoding="utf-8")
    lock_path = BUILD / "lock"
    lock_path.write_text("", encoding="utf-8")
    if OUTPUT.exists():
        OUTPUT.unlink()
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(xml_path, "document.mwb.xml")
        zf.write(lock_path, "lock")


def validate_xml(xml_content):
    import xml.etree.ElementTree as ET

    try:
        ET.fromstring(xml_content)
    except ET.ParseError as exc:
        raise RuntimeError("XML inválido gerado: " + str(exc)) from exc


def main():
    ensure_template()
    schema = load_schema()
    template_xml = TEMPLATE_XML.read_text(encoding="utf-8")
    builder = MwbBuilder()
    xml = merge_with_template(template_xml, builder, schema)
    validate_xml(xml)
    write_mwb(xml)
    print("Arquivo gerado:", OUTPUT)
    print("Tabelas:", ", ".join(n for n, _ in schema))


if __name__ == "__main__":
    main()
