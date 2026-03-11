package school.sptech;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        Logs verificador = new Logs();

        Boolean resultado = verificador.login();
        Thread.sleep(3000);
        String acessoInfo = verificador.acessoInformacao(resultado);
        Thread.sleep(3000);
        String logout = verificador.logout(resultado);
    }
}
