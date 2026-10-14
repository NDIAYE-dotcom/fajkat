import { useState } from 'react'
import DateInput from '../../../../components/ui/DateInput/DateInput.jsx'
import Field from '../../../../components/ui/Field/Field.jsx'
import MoneyInput from '../../../../components/ui/MoneyInput/MoneyInput.jsx'
import PhoneInput from '../../../../components/ui/PhoneInput/PhoneInput.jsx'
import SearchBar from '../../../../components/ui/SearchBar/SearchBar.jsx'
import { formatFCFA, formatTelephone } from '../../../../lib/format.js'
import Demo from '../../Demo/Demo.jsx'
import SectionAtelier from '../../SectionAtelier/SectionAtelier.jsx'
import './ChampsMetier.css'

// Valeur réellement transmise au formulaire, affichée sous chaque champ pour vérification.
function Valeur({ children }) {
  return (
    <p className="champs-metier__valeur">
      Valeur : <code>{children}</code>
    </p>
  )
}

export default function ChampsMetier() {
  const [telephone, setTelephone] = useState('+221771234567')
  const [montant, setMontant] = useState(12500)
  const [naissance, setNaissance] = useState({ type: 'date', date: null, texte: '' })
  const [recherche, setRecherche] = useState('')

  return (
    <SectionAtelier
      id="champs-metier"
      titre="Champs métier"
      intro="Téléphone UEMOA, montant en FCFA, date ou âge déclaré, recherche : les formats du terrain, sans calcul à faire par le soignant."
    >
      <Demo titre="Téléphone, montant, date de naissance">
        <div className="champs-metier__grille">
          <div>
            <Field
              label="Téléphone"
              aide="Collez « +225 01 02 03 04 05 » : le pays change tout seul."
            >
              <PhoneInput value={telephone} onChange={setTelephone} />
            </Field>
            <Valeur>{telephone || '(vide)'}</Valeur>
            <p className="champs-metier__valeur">Affichage : {formatTelephone(telephone)}</p>
          </div>

          <div>
            <Field label="Montant encaissé" aide="Entiers seulement, pas de centimes.">
              <MoneyInput value={montant} onChange={setMontant} />
            </Field>
            <Valeur>{montant === null ? 'null' : montant}</Valeur>
            <p className="champs-metier__valeur">Affichage : {formatFCFA(montant)}</p>
          </div>

          <div>
            <Field
              label="Date de naissance"
              erreur={
                naissance.type === 'date' && naissance.texte?.length === 10 && !naissance.date
                  ? "Cette date n'existe pas. Vérifiez le jour et le mois."
                  : undefined
              }
            >
              <DateInput ageDeclare value={naissance} onChange={setNaissance} />
            </Field>
            <Valeur>{JSON.stringify(naissance)}</Valeur>
          </div>
        </div>
      </Demo>

      <Demo
        titre="États des champs métier"
        etats={[
          {
            libelle: 'Désactivé',
            contenu: (
              <Field label="Téléphone">
                <PhoneInput value="+221781112233" disabled />
              </Field>
            ),
          },
          {
            libelle: 'Erreur',
            contenu: (
              <Field label="Montant" erreur="Le montant doit être supérieur à 0.">
                <MoneyInput value={null} onChange={() => {}} />
              </Field>
            ),
          },
          {
            libelle: 'Focus',
            contenu: (
              <Field label="Date du rendez-vous">
                <DateInput value={{ type: 'date', date: null, texte: '13/10' }} data-etat="focus" />
              </Field>
            ),
          },
        ]}
      />

      <Demo
        titre="Recherche"
        etats={[
          {
            libelle: 'Normal',
            contenu: (
              <SearchBar
                libelle="Rechercher un patient"
                placeholder="Nom, téléphone, quartier…"
                valeur={recherche}
                onChange={setRecherche}
              />
            ),
          },
          {
            libelle: 'Chargement',
            contenu: <SearchBar libelle="Rechercher (chargement)" valeur="Diop" chargement />,
          },
          {
            libelle: 'Désactivé',
            contenu: (
              <SearchBar libelle="Rechercher (désactivé)" placeholder="Hors ligne" disabled />
            ),
          },
        ]}
      />
    </SectionAtelier>
  )
}
