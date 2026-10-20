import Tampon from '../../../../components/ui/Tampon/Tampon.jsx'
import { formatDateHeure } from '../../../../lib/format.js'
import { libelleDeclaration, resumeExamen } from '../../utils.js'
import ConstantesPassage from '../ConstantesPassage/ConstantesPassage.jsx'
import './LectureConsultation.css'

function Bloc({ titre, children }) {
  return (
    <section className="lecture-consultation__bloc">
      <h2 className="lecture-consultation__titre">{titre}</h2>
      {children}
    </section>
  )
}

const texte = (t) =>
  t?.trim() ? (
    <p className="lecture-consultation__texte">{t}</p>
  ) : (
    <p className="lecture-consultation__vide">Non renseigné</p>
  )

// Consultation validée, en lecture seule : elle ne se modifie plus. Les avenants datés
// suivent, avec leur auteur.
export default function LectureConsultation({ consultation: c }) {
  return (
    <div className="lecture-consultation">
      <Bloc titre="Motif et histoire de la maladie">
        {texte(c.reason)}
        {c.history?.trim() && <p className="lecture-consultation__texte">{c.history}</p>}
      </Bloc>
      <Bloc titre="Constantes du passage">
        <ConstantesPassage mesures={c.vitals} avecPassage={Boolean(c.visit_id)} />
      </Bloc>
      <Bloc titre="Examen clinique">{texte(c.examination)}</Bloc>
      <Bloc titre="Examens rapides">
        {c.tests?.length ? (
          <ul className="lecture-consultation__liste">
            {c.tests.map((t) => (
              <li key={t.id}>
                <strong>{t.label}</strong> : {resumeExamen(t) || '—'}
                {t.note && <span className="lecture-consultation__note">{` · ${t.note}`}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="lecture-consultation__vide">Aucun examen rapide</p>
        )}
      </Bloc>
      <Bloc titre="Diagnostics">
        {c.diagnoses?.length ? (
          <ul className="lecture-consultation__liste">
            {c.diagnoses.map((d) => (
              <li key={d.id} className="lecture-consultation__diagnostic">
                {d.code && <span className="lecture-consultation__code">{d.code}</span>}
                <span>{d.label}</span>
                <span className="lecture-consultation__note">
                  {d.rank === 'primary' ? 'principal' : 'secondaire'}
                </span>
                {d.is_notifiable && (
                  <Tampon ton={d.notification_delay === 'immediate' ? 'alerte' : 'encre'}>
                    {libelleDeclaration(d.notification_delay)}
                  </Tampon>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="lecture-consultation__vide">Aucun diagnostic</p>
        )}
      </Bloc>
      <Bloc titre="Conduite à tenir">{texte(c.plan)}</Bloc>
      {c.addenda?.length > 0 && (
        <Bloc titre="Avenants">
          <ul className="lecture-consultation__avenants">
            {c.addenda.map((a) => (
              <li key={a.id} className="lecture-consultation__avenant">
                <p className="lecture-consultation__signature">
                  {`${formatDateHeure(a.created_at)} · ${a.author_name}`}
                </p>
                <p className="lecture-consultation__texte">{a.body}</p>
              </li>
            ))}
          </ul>
        </Bloc>
      )}
    </div>
  )
}
