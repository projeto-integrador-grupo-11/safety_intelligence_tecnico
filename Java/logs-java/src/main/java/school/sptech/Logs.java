package school.sptech;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Scanner;

public class Logs {
    Boolean login() {
        Scanner scanner = new Scanner(System.in);

        System.out.println("Digite seu email:");
        String emailDigitado = scanner.nextLine();

        System.out.println("Digite sua senha:");
        String senhaDigitada = scanner.nextLine();

        String email = "rafael.asilva@sptech.school";
        String senha = "abacaxi123";

        LocalDateTime tentativaLogin = LocalDateTime.now();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");
        String dataFormatada = tentativaLogin.format(formatter);

        if (emailDigitado.equals(email) && senhaDigitada.equals(senha)) {
            System.out.printf("%s INFO - Login realizado com sucesso!\n", dataFormatada);
            return true;
        } else {
            System.out.printf("%s ERRO - Falha ao tentar realizar login!\n", dataFormatada);
            return false;
        }
    }

    String acessoInformacao (Boolean resultado) throws InterruptedException {
        LocalDateTime acessoInfo = LocalDateTime.now();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");
        String dataFormatada = acessoInfo.format(formatter);
        Boolean clicou = true;
        Boolean erro = true;
        String mensagem = "";

        if (resultado && clicou) {
            System.out.println("Usuario interage com aplicação para buscar dados...");
            Thread.sleep(1000);
            if (erro) {
                mensagem = "%s ERRO - Falha em buscar informações!\n";
                System.out.printf(mensagem, dataFormatada);
            } else {
                mensagem = "%s INFO - Êxito em buscar informações!\n";
                System.out.printf(mensagem, dataFormatada);
            }
        } else  {
            return  null;
        }

        return  mensagem;
    }

    String logout (Boolean resultado) throws InterruptedException {
        LocalDateTime logoutInfo = LocalDateTime.now();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");
        String dataFormatada = logoutInfo.format(formatter);
        String msgLogout = "";
        if (resultado) {
            System.out.println("Usuário clica em sair");
            Thread.sleep(3000);
            msgLogout =  "%s - INFO - Usuário deslogou\n";
            System.out.printf(msgLogout,dataFormatada);
        } else {
            return null;
        }

        return msgLogout;
    }
}
