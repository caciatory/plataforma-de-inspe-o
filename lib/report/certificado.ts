const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function gerarCodigoCertificado(): string {
  return Array.from({ length: 8 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join("");
}
