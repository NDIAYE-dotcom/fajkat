import { useEffect, useState } from 'react'

// Compteur qui avance d'un pas toutes les « intervalle » millisecondes, seulement quand « actif ».
// Les aperçus animés en déduisent leur état : à l'arrêt, ils restent figés sur le dernier pas.
export function useCadence(intervalle, actif) {
  const [pas, setPas] = useState(0)

  useEffect(() => {
    if (!actif) return undefined
    const minuterie = setInterval(() => setPas((p) => p + 1), intervalle)
    return () => clearInterval(minuterie)
  }, [intervalle, actif])

  return pas
}
