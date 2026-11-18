// Korb – Artikelkatalog (Deutsch)
// Reihenfolge der Kategorien = Standard-Gangfolge im typischen deutschen Supermarkt.
export const CATEGORIES = [
  { key: 'obst', name: 'Obst & Gemüse', hue: 125 },
  { key: 'brot', name: 'Brot & Backwaren', hue: 32 },
  { key: 'kuehl', name: 'Milch, Käse & Eier', hue: 205 },
  { key: 'fleisch', name: 'Fleisch & Fisch', hue: 355 },
  { key: 'vorrat', name: 'Nudeln, Reis & Konserven', hue: 24 },
  { key: 'gewuerz', name: 'Öl, Gewürze & Backen', hue: 46 },
  { key: 'fruehstueck', name: 'Frühstück & Kaffee', hue: 18 },
  { key: 'suess', name: 'Snacks & Süßes', hue: 325 },
  { key: 'getraenke', name: 'Getränke', hue: 190 },
  { key: 'tk', name: 'Tiefkühl', hue: 215 },
  { key: 'drogerie', name: 'Drogerie & Haushalt', hue: 268 },
  { key: 'sonst', name: 'Sonstiges', hue: 150 },
];

// Format: "Name|Emoji|Kategorie|Synonyme (Komma)|s" – "s" = Vorratsartikel (beim Rezeptimport abgewählt)
export const CATALOG_RAW = `
Äpfel|🍎|obst|apfel
Bananen|🍌|obst|banane
Birnen|🍐|obst|birne
Orangen|🍊|obst|orange,apfelsinen,mandarinen
Zitronen|🍋|obst|zitrone,limetten,limette
Weintrauben|🍇|obst|trauben
Erdbeeren|🍓|obst|erdbeere
Heidelbeeren|🫐|obst|blaubeeren,beeren
Kiwis|🥝|obst|kiwi
Mango|🥭|obst|mangos
Ananas|🍍|obst|
Melone|🍉|obst|wassermelone
Avocados|🥑|obst|avocado
Tomaten|🍅|obst|tomate,cherrytomaten,rispentomaten
Gurke|🥒|obst|gurken,salatgurke
Paprika|🫑|obst|paprikaschote
Karotten|🥕|obst|karotte,möhren,möhre
Kartoffeln|🥔|obst|kartoffel
Süßkartoffeln|🍠|obst|süßkartoffel
Zwiebeln|🧅|obst|zwiebel,rote zwiebeln
Knoblauch|🧄|obst|knoblauchzehen,knoblauchzehe
Ingwer|🫚|obst|
Salat|🥬|obst|kopfsalat,eisbergsalat,feldsalat,rucola
Spinat|🥬|obst|blattspinat
Lauch|🥬|obst|porree,frühlingszwiebeln
Brokkoli|🥦|obst|
Zucchini|🥒|obst|
Champignons|🍄|obst|pilze
Mais|🌽|obst|maiskolben
Chili|🌶️|obst|chilis,peperoni
Basilikum|🌿|obst|kräuter
Petersilie|🌿|obst|schnittlauch,koriander,dill
Brot|🍞|brot|vollkornbrot,bauernbrot,sauerteigbrot
Brötchen|🥖|brot|semmeln,schrippen,weckle
Baguette|🥖|brot|
Toast|🍞|brot|toastbrot
Croissants|🥐|brot|croissant
Brezeln|🥨|brot|brezel,breze,laugenbrezel
Wraps|🫓|brot|tortillas,fladenbrot
Milch|🥛|kuehl|vollmilch,frischmilch
Hafermilch|🥛|kuehl|haferdrink,sojamilch,mandelmilch
Butter|🧈|kuehl|
Käse|🧀|kuehl|gouda,emmentaler,bergkäse,reibekäse
Parmesan|🧀|kuehl|
Mozzarella|🧀|kuehl|burrata
Feta|🧀|kuehl|schafskäse,halloumi,grillkäse
Frischkäse|🧀|kuehl|
Joghurt|🥣|kuehl|naturjoghurt,skyr
Quark|🥣|kuehl|magerquark
Sahne|🥛|kuehl|schlagsahne,kochsahne
Schmand|🥣|kuehl|saure sahne,crème fraîche,creme fraiche
Eier|🥚|kuehl|ei
Tofu|🌱|kuehl|
Pudding|🍮|kuehl|
Hackfleisch|🥩|fleisch|hack,gehacktes,rinderhack
Hähnchen|🍗|fleisch|hähnchenbrust,hühnchen,chicken,hähnchenschenkel
Steak|🥩|fleisch|rindfleisch,schnitzel
Schinken|🥓|fleisch|kochschinken
Speck|🥓|fleisch|bacon,schinkenwürfel
Salami|🥓|fleisch|aufschnitt,wurst
Würstchen|🌭|fleisch|wiener,bratwurst,bratwürste
Lachs|🐟|fleisch|räucherlachs,fisch
Garnelen|🦐|fleisch|shrimps
Nudeln|🍝|vorrat|pasta,spaghetti,penne,fusilli,tagliatelle
Reis|🍚|vorrat|basmatireis,risottoreis
Couscous|🍚|vorrat|bulgur,quinoa
Linsen|🫘|vorrat|kichererbsen,bohnen,kidneybohnen
Dosentomaten|🥫|vorrat|passierte tomaten,passata,gehackte tomaten,stückige tomaten
Tomatenmark|🥫|vorrat|
Thunfisch|🐟|vorrat|
Brühe|🥣|vorrat|gemüsebrühe,hühnerbrühe
Kokosmilch|🥥|vorrat|
Salz|🧂|gewuerz||s
Pfeffer|🧂|gewuerz||s
Olivenöl|🫒|gewuerz|öl|s
Rapsöl|🌻|gewuerz|sonnenblumenöl|s
Essig|🍶|gewuerz|balsamico|s
Zucker|🧂|gewuerz|puderzucker|s
Mehl|🌾|gewuerz|weizenmehl|s
Backpulver|🧁|gewuerz|natron,vanillezucker|s
Hefe|🍞|gewuerz|trockenhefe
Ketchup|🍅|gewuerz|
Senf|🌭|gewuerz|
Mayonnaise|🥚|gewuerz|mayo
Sojasauce|🍶|gewuerz|sojasoße
Pesto|🌿|gewuerz|
Paprikapulver|🌶️|gewuerz|oregano,gewürze|s
Kaffee|☕|fruehstueck|kaffeebohnen,espresso,kaffeepads
Tee|🍵|fruehstueck|grüner tee
Müsli|🥣|fruehstueck|granola,cornflakes
Haferflocken|🥣|fruehstueck|
Marmelade|🍓|fruehstueck|konfitüre
Honig|🍯|fruehstueck|
Nuss-Nougat-Creme|🍫|fruehstueck|nutella
Erdnussbutter|🥜|fruehstueck|
Schokolade|🍫|suess|
Kekse|🍪|suess|cookies
Chips|🥔|suess|
Gummibärchen|🍬|suess|gummibären,bonbons
Nüsse|🥜|suess|erdnüsse,mandeln,cashews
Salzstangen|🥨|suess|
Popcorn|🍿|suess|
Kuchen|🍰|suess|
Wasser|💧|getraenke|mineralwasser,sprudel,stilles wasser
Saft|🧃|getraenke|orangensaft,apfelsaft,apfelschorle
Cola|🥤|getraenke|limo,limonade,spezi
Eistee|🧃|getraenke|
Bier|🍺|getraenke|radler,alkoholfreies bier
Wein|🍷|getraenke|rotwein,weißwein,rosé
Sekt|🥂|getraenke|prosecco,crémant
Pizza|🍕|tk|tiefkühlpizza,tk-pizza
Pommes|🍟|tk|
Eis|🍦|tk|eiscreme,speiseeis
Erbsen|🫛|tk|tk-erbsen,erbsen tk
Fischstäbchen|🐟|tk|
Eiswürfel|🧊|tk|
Klopapier|🧻|drogerie|toilettenpapier
Küchenrolle|🧻|drogerie|küchenpapier
Taschentücher|🤧|drogerie|
Zahnpasta|🪥|drogerie|zahncreme,zahnbürste
Shampoo|🧴|drogerie|duschgel,spülung,deo
Seife|🧼|drogerie|handseife
Spülmittel|🧽|drogerie|schwämme,schwamm
Spülmaschinentabs|🫧|drogerie|tabs,klarspüler
Waschmittel|🧺|drogerie|weichspüler
Müllbeutel|🗑️|drogerie|müllsäcke
Sonnencreme|🧴|drogerie|
Rasierer|🪒|drogerie|rasierklingen
Windeln|👶|drogerie|feuchttücher
Batterien|🔋|drogerie|
Katzenfutter|🐈|sonst|katzenstreu
Hundefutter|🐕|sonst|
Blumen|💐|sonst|
Kerzen|🕯️|sonst|teelichter
Holzkohle|🔥|sonst|grillkohle,anzünder
`;
