import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'

// Marques d'un jour dans l'agenda : jour férié (avec son nom) et jour de fermeture.
export default function MarquesJour({ ferie, ferme }) {
  return (
    <>
      {ferie && <Tampon ton="alerte">{`Férié · ${ferie.label}`}</Tampon>}
      {ferme && <Tampon ton="neutre">Fermé</Tampon>}
    </>
  )
}
