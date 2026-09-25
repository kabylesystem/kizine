import type { NextConfig } from "next";

const config: NextConfig = {
  // Le solveur HiGHS et le client libSQL embarquent du binaire : ils restent
  // hors du bundle serveur, sinon le build Vercel les casse.
  serverExternalPackages: ["highs", "@libsql/client", "libsql"],
  typedRoutes: false,
  experimental: {
    /**
     * Cache client des segments déjà visités. Par défaut une page dynamique
     * n'est jamais gardée, donc revenir sur Week refaisait tout l'aller-retour.
     * Trente secondes suffisent à rendre le va-et-vient entre onglets immédiat
     * sans risquer d'afficher un plan périmé : chaque écriture appelle
     * router.refresh(), qui invalide ce cache.
     */
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default config;
