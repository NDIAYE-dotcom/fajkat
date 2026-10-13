import './TamponFrappe.css'

// Tampon encreur qui s'abat sur le dessin choisi.
// La texture d'encre irrégulière vient d'un filtre SVG (bruit + léger déplacement des bords).
export default function TamponFrappe({ children, className = '' }) {
  return (
    <span className={`tampon-frappe ${className}`.trim()} aria-hidden="true">
      <svg className="tampon-frappe__filtres" width="0" height="0" focusable="false">
        <filter id="tampon-frappe-encre" x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed="7"
            result="bruit"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="bruit"
            scale="2.5"
            xChannelSelector="R"
            yChannelSelector="G"
            result="bords"
          />
          <feColorMatrix
            in="bruit"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 4.9"
            result="lacunes"
          />
          <feComposite in="bords" in2="lacunes" operator="in" />
        </filter>
      </svg>
      <span className="tampon-frappe__encre">{children}</span>
    </span>
  )
}
