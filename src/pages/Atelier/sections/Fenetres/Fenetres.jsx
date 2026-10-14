import { useState } from 'react'
import Button from '../../../../components/ui/Button/Button.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import Drawer from '../../../../components/ui/Drawer/Drawer.jsx'
import Modal from '../../../../components/ui/Modal/Modal.jsx'
import Textarea from '../../../../components/ui/Textarea/Textarea.jsx'
import { useToast } from '../../../../hooks/useToast.js'
import Demo from '../../Demo/Demo.jsx'
import SectionAtelier from '../../SectionAtelier/SectionAtelier.jsx'
import './Fenetres.css'

export default function Fenetres() {
  const toast = useToast()
  const [modale, setModale] = useState(false)
  const [tiroir, setTiroir] = useState(false)

  // Erreur d'enregistrement : doit rester visible et cliquable au-dessus d'une modale ouverte.
  function erreurEnregistrement() {
    toast.erreur("L'enregistrement n'a pas abouti", {
      message: 'La connexion a été coupée. Votre saisie est conservée.',
      action: { libelle: 'Réessayer', onClick: () => toast.succes('Passage annulé') },
    })
  }

  return (
    <SectionAtelier
      id="fenetres"
      titre="Fenêtres et notifications"
      intro="Modale et tiroir : focus enfermé, Échap pour fermer, retour du focus sur le bouton d'origine. Les notifications restent visibles au-dessus d'une modale ou d'un tiroir ouvert."
    >
      <Demo titre="Notifications">
        <Button
          variante="secondaire"
          onClick={() =>
            toast.succes('Patient enregistré', { message: 'Awa Diop, dossier PS-2026-0142.' })
          }
        >
          Succès
        </Button>
        <Button variante="secondaire" onClick={() => toast.info('Synchronisation terminée')}>
          Information
        </Button>
        <Button
          variante="secondaire"
          onClick={() =>
            toast.attention('Stock bas', { message: 'Paracétamol 500 mg : 2 boîtes restantes.' })
          }
        >
          Avertissement
        </Button>
        <Button variante="secondaire" onClick={erreurEnregistrement}>
          Erreur (reste affichée)
        </Button>
      </Demo>

      <Demo
        titre="Modale"
        note="Test prioritaire : ouvrez la modale, puis « Confirmer » simule une coupure. L'erreur doit apparaître au-dessus du voile, et « Réessayer » doit répondre."
      >
        <Button onClick={() => setModale(true)}>Annuler un passage</Button>
        <Modal
          ouvert={modale}
          onFermer={() => setModale(false)}
          titre="Annuler le passage de Fatou Sow ?"
          description="Le ticket n° 003 sera marqué ANNULÉ dans le registre du jour."
          actions={
            <>
              <Button variante="secondaire" onClick={() => setModale(false)}>
                Garder le passage
              </Button>
              <Button onClick={erreurEnregistrement}>Confirmer l'annulation</Button>
            </>
          }
        >
          <Field label="Motif de l'annulation" facultatif>
            <Textarea maxLength={200} rows={3} />
          </Field>
        </Modal>
      </Demo>

      <Demo
        titre="Tiroir"
        note="Pleine largeur sur téléphone. Même test d'erreur depuis le pied du tiroir."
      >
        <Button variante="secondaire" onClick={() => setTiroir(true)}>
          Voir le détail d'un patient
        </Button>
        <Drawer
          ouvert={tiroir}
          onFermer={() => setTiroir(false)}
          titre="Ibrahima Fall"
          actions={
            <>
              <Button variante="secondaire" onClick={erreurEnregistrement}>
                Simuler une erreur
              </Button>
              <Button onClick={() => toast.succes('Passage en caisse validé')}>
                Passer en caisse
              </Button>
            </>
          }
        >
          <dl className="fenetres__fiche">
            <dt>Âge</dt>
            <dd>41 ans</dd>
            <dt>Quartier</dt>
            <dd>Sikilo</dd>
            <dt>Motif</dt>
            <dd>Plaie au pied</dd>
            <dt>Montant</dt>
            <dd className="fenetres__chiffres">1 500 FCFA</dd>
          </dl>
        </Drawer>
      </Demo>
    </SectionAtelier>
  )
}
