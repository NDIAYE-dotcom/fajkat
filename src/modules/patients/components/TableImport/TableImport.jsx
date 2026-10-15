import { useState } from 'react'
import Pagination from '../../../../components/ui/Pagination/Pagination.jsx'
import Table from '../../../../components/ui/Table/Table.jsx'
import './TableImport.css'

const PAR_PAGE = 50

// Tableau d'aperçu de l'import, paginé côté navigateur : un fichier de 5 000 lignes reste
// fluide sur un téléphone d'entrée de gamme.
export default function TableImport({ colonnes, lignes, legende, vide }) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE))
  const courante = Math.min(page, totalPages)
  const visibles = lignes.slice((courante - 1) * PAR_PAGE, courante * PAR_PAGE)

  return (
    <div className="table-import">
      <Table
        colonnes={colonnes}
        lignes={visibles}
        cleLigne="numero"
        legende={legende}
        vide={vide}
        hauteurMax="none"
      />
      <Pagination
        page={courante}
        totalPages={totalPages}
        total={lignes.length}
        parPage={PAR_PAGE}
        libelle={`Pages : ${legende}`}
        onChange={setPage}
      />
    </div>
  )
}
