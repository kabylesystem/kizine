/**
 * La marque de Kizine : une cocotte vue de face, anse et couvercle.
 * Dessinée au trait pour rester nette à toutes les tailles et prendre la
 * couleur du texte à côté d'elle, sans fichier image à charger.
 */
export function Mark({ size = 26, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* le couvercle et son bouton */}
      <path d="M16 5.5v2" />
      <path d="M7 11h18" />
      {/* les deux anses */}
      <path d="M7 15H4.5" />
      <path d="M25 15h2.5" />
      {/* la cocotte */}
      <path d="M6.5 11.5h19v8a7 7 0 0 1-7 7h-5a7 7 0 0 1-7-7Z" />
    </svg>
  );
}
