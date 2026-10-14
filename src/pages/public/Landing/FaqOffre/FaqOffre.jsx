import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { useApparition } from '../../../../hooks/useApparition.js'
import './FaqOffre.css'

// Questions fréquentes en accordéon : chaque question est un bouton (aria-expanded)
// qui ouvre sa réponse. Plusieurs réponses peuvent rester ouvertes.
export default function FaqOffre({ questions }) {
  const [ouvertes, setOuvertes] = useState(() => new Set())
  const [ref, apparu] = useApparition()
  const id = useId()

  function basculer(index) {
    setOuvertes((avant) => {
      const apres = new Set(avant)
      if (apres.has(index)) apres.delete(index)
      else apres.add(index)
      return apres
    })
  }

  return (
    <section
      ref={ref}
      id="faq"
      className="faq-offre"
      data-apparu={apparu || undefined}
      aria-labelledby="faq-titre"
    >
      <div className="faq-offre__interieur">
        <p className="faq-offre__surtitre apparition">Questions fréquentes</p>
        <h2 id="faq-titre" className="faq-offre__titre apparition" style={{ '--rang': 1 }}>
          Ce que les structures nous demandent
        </h2>

        <ul className="faq-offre__liste apparition" style={{ '--rang': 2 }}>
          {questions.map(({ question, reponse }, index) => {
            const ouverte = ouvertes.has(index)
            return (
              <li key={question} className="faq-offre__element">
                <h3 className="faq-offre__question">
                  <button
                    type="button"
                    className="faq-offre__bouton"
                    aria-expanded={ouverte}
                    aria-controls={`${id}-${index}`}
                    onClick={() => basculer(index)}
                  >
                    {question}
                    <ChevronDown className="faq-offre__chevron" size={20} aria-hidden="true" />
                  </button>
                </h3>
                <div id={`${id}-${index}`} className="faq-offre__reponse" hidden={!ouverte}>
                  {reponse.map((paragraphe) => (
                    <p key={paragraphe}>{paragraphe}</p>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
