# Tallinna koolide kaart

## GitHubi paigaldamine
Laadi kõik failid repository juurkausta, säilitades kaustastruktuuri.

1. Settings > Pages > Source: GitHub Actions.
2. Actions > Update all Tallinn schools > Run workflow.
3. Oota, kuni andmed tehakse commitiks ja Deploy to GitHub Pages lõpetab.
4. Leht: https://raitelvak.github.io/Tallinna-Koolide-asukohad/

## Kohalik käivitamine
```bash
npm install
npm run dev
```

## Märkus logo kohta
`public/haridusamet-logo.svg` on tehniline kohalik tunnus. Ametliku avaldamise korral asenda see Tallinna ametlikust identiteedipangast saadud failiga sama failinime all.
