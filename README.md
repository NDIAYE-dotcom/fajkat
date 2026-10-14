# Fajkat

Logiciel de gestion pour les postes de santé et les cliniques, au Sénégal puis dans l'espace UEMOA. En cours de développement.

Les règles du projet et le journal des étapes sont dans [CLAUDE.md](CLAUDE.md).

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs Supabase
npm run dev
```

## Construire

```bash
npm run build   # vite build, puis pages statiques de partage, sitemap.xml et robots.txt
```

Pile : React + Vite (JavaScript), CSS pur, Supabase, hébergement Vercel.
