// Catalogo curato di marchi nautici e dei loro modelli più diffusi nei porti italiani e del Mediterraneo.

export type MarcaBarca = { marca: string; settore: "motore" | "vela" | "entrambi"; modelli: string[] };

export const MARCHE_BARCHE: MarcaBarca[] = [
  {
    marca: "Riva",
    settore: "motore",
    modelli: ["Aquariva Super", "Rivamare 38", "Rivamare 56", "Iseo", "Dolceriva", "Rivale 56", "Corsaro 100", "Bahamas 54", "Vertigo 63", "Ego Super", "76 Perseo Super", "102 Corsaro Super", "130 Bellissima"],
  },
  {
    marca: "Ferretti Yachts",
    settore: "motore",
    modelli: ["450", "500", "550", "580", "670", "720", "780", "860", "920", "1000", "500 Fly", "550 Fly", "670 Fly", "720 Fly"],
  },
  {
    marca: "Pershing",
    settore: "motore",
    modelli: ["5X", "6X", "7X", "8X", "9X", "140", "108", "82", "74", "70"],
  },
  {
    marca: "Itama",
    settore: "motore",
    modelli: ["38", "45", "45S", "54", "62", "75", "62RS", "Forty", "FiftyFive", "Sixty"],
  },
  {
    marca: "Custom Line",
    settore: "motore",
    modelli: ["97", "106", "108", "120", "140", "Navetta 28", "Navetta 30", "Navetta 33", "Navetta 37", "Navetta 42", "Navetta 48"],
  },
  {
    marca: "Azimut",
    settore: "motore",
    modelli: ["Fly 53", "Fly 60", "Fly 68", "Fly 72", "Fly 78", "S6", "S7", "S8", "S10", "Grande 26M", "Grande 32M", "Grande 36M", "Atlantis 45", "Verve 42", "Magellano 66"],
  },
  {
    marca: "Benetti",
    settore: "motore",
    modelli: ["Class 116", "Oasis 34M", "Oasis 40M", "Mediterraneo 116", "Fast 125", "Delfino 95", "Motopanfilo 37M", "B.Now 50M", "B.Now 60M", "B.Yond 37M", "B.Century 55", "My55", "Sail 5", "Se77antasette"],
  },
  {
    marca: "Sanlorenzo",
    settore: "motore",
    modelli: ["SX76", "SX88", "SX96", "SX100", "SX112", "SL78", "SL86", "SL90", "SL96", "SL102", "SL106", "SL118", "SD96", "SD112", "SD126"],
  },
  {
    marca: "Sunseeker",
    settore: "motore",
    modelli: ["Manhattan 52", "Manhattan 55", "Manhattan 68", "Manhattan 76", "Predator 50", "Predator 57", "Predator 60", "Predator 65", "Predator 74", "Portofino 40", "Portofino 47", "Sport Yacht 65", "Sport Yacht 74", "88 Yacht", "100 Yacht"],
  },
  {
    marca: "Princess",
    settore: "motore",
    modelli: ["F45", "F50", "F55", "F62", "F65", "F70", "S62", "S66", "S72", "S78", "V40", "V50", "V55", "V60", "Y72", "Y78", "Y85"],
  },
  {
    marca: "Fairline",
    settore: "motore",
    modelli: ["Squadron 50", "Squadron 53", "Squadron 65", "Squadron 68", "Targa 43", "Targa 45", "Targa 50", "Targa 63", "Phantom 48", "Phantom 65", "F//Line 33", "F//Line 36", "F//Line 42", "Targa 40"],
  },
  {
    marca: "Cranchi",
    settore: "motore",
    modelli: ["Zaffiro 34", "Zaffiro 36", "E52", "E56", "T53", "T55", "Sessantasette 67", "M44", "M46", "Amedeo 42", "Endurance 30", "XT 36", "Settantadue 72", "Fly 50", "CSL 27"],
  },
  {
    marca: "Sessa Marine",
    settore: "motore",
    modelli: ["Key Largo 20", "Key Largo 24", "Key Largo 30", "Key Largo 34", "Key Largo 36", "Key Largo 40", "C38", "C42", "C44", "C48", "C54", "F42", "F48", "F54", "Marine 22"],
  },
  {
    marca: "Fiart",
    settore: "motore",
    modelli: ["4Seven", "43 Seawalker", "35 Seawalker", "39 Seawalker", "52", "49", "48", "44", "38", "34", "47", "50"],
  },
  {
    marca: "Rio",
    settore: "motore",
    modelli: ["Daytona 34", "Daytona 44", "Daytona 50", "Espera 34", "Espera 40", "Espera 44", "Parana 38", "Parana 44", "Colorado 36", "Colorado 44", "Sol 30", "Sol 36", "800", "900", "1000"],
  },
  {
    marca: "Ranieri",
    settore: "motore",
    modelli: ["Shadow 22", "Shadow 26", "Shadow 28", "Voyager 19", "Voyager 21", "Voyager 23", "Voyager 25", "Voyager 27", "Sea Lady 17", "Sea Lady 19", "Sea Lady 21", "Sea Lady 23", "Sun 19", "Sun 21", "Cayman 26"],
  },
  {
    marca: "Quicksilver",
    settore: "motore",
    modelli: ["Activ 455", "Activ 505", "Activ 555", "Activ 605", "Activ 675", "Activ 755", "Activ 805", "Activ 855", "Activ 905", "Captur 485", "Captur 555", "Captur 605", "Captur 675", "Pilothouse 605", "Pilothouse 705", "Pilothouse 805"],
  },
  {
    marca: "Axopar",
    settore: "motore",
    modelli: ["22 Spyder", "22 T-Top", "24 Spyder", "25 Sun-Top", "25 XC Cross Cabin", "28 Cabin", "28 Spyder", "28 T-Top", "29 XC Cross Cabin", "37 Spyder", "37 Sun-Top", "37 XC Cross Cabin", "45 XC Cross Cabin", "45 Spyder"],
  },
  {
    marca: "Saxdor",
    settore: "motore",
    modelli: ["200 Sport", "200 Pro Sport", "205", "270 GTO", "270 GTC", "320 GTO", "320 GTC", "400 GTO", "400 GTC", "400 GTR"],
  },
  {
    marca: "Capelli",
    settore: "motore",
    modelli: ["Tempest 600", "Tempest 650", "Tempest 750", "Tempest 850", "Tempest 900", "Tempest 1000", "Tempest 1200", "Strike 6", "Strike 7", "Strike 8", "Sailor 7", "Sun 750"],
  },
  {
    marca: "Joker Boat",
    settore: "motore",
    modelli: ["Clubman 24", "Clubman 26", "Clubman 28", "Clubman 30", "Clubman 33", "Clubman 35", "Clubman 38", "Beach 23", "Beach 26", "Beach 30", "Silver 28", "Silver 30"],
  },
  {
    marca: "Zodiac",
    settore: "motore",
    modelli: ["Medline 500", "Medline 580", "Medline 660", "Medline 750", "Medline 850", "Pro 420", "Pro 500", "Pro 550", "Pro 650", "Pro 750", "Bayrunner 500", "Bayrunner 550", "Bayrunner 650", "N-Zo 700", "N-Zo 760", "Yachtline 360", "Yachtline 400"],
  },
  {
    marca: "Bombard",
    settore: "motore",
    modelli: ["Explorer 500", "Explorer 550", "Explorer 600", "Explorer 650", "Explorer 700", "Sunrider 500", "Sunrider 550", "Sunrider 650", "Aerotec 380", "Aerotec 420", "Aerotec 470", "Typhoon 380", "Typhoon 420", "Typhoon 470", "C5", "Max 3"],
  },
  {
    marca: "Lomac",
    settore: "motore",
    modelli: ["Adrenalina 6.5", "Adrenalina 7.5", "Adrenalina 8.5", "Adrenalina 10.0", "GT 700", "GT 850", "GT 1000", "IN 580", "IN 660", "IN 750", "IN 850", "Turismo 660", "Turismo 750", "Turismo 850", "OK 530", "OK 600"],
  },
  {
    marca: "Novamarine",
    settore: "motore",
    modelli: ["BS 90", "BS 100", "BS 110", "BS 130", "HD 700", "HD 800", "HD 900", "HD 1000", "RH 660", "RH 710", "RH 780", "RH 880", "NS 750", "NS 850", "NS 950"],
  },
  {
    marca: "Magazzù",
    settore: "motore",
    modelli: ["MX 10", "MX 11", "MX 13", "MX 14", "MX 17", "GU 90", "GU 100", "GU 120", "SA 90", "C 12", "C 14"],
  },
  {
    marca: "Sacs",
    settore: "motore",
    modelli: ["Strider 10", "Strider 11", "Strider 13", "Strider 15", "Rebel 40", "Rebel 47", "Rebel 55", "S 470", "S 590", "S 680", "Techno 720"],
  },
  {
    marca: "Zar Formenti",
    settore: "motore",
    modelli: ["Z3", "Z5", "Z7", "Z8", "Z9", "Z10", "Z12", "53", "59", "61", "65", "79", "85", "Mini 47", "Mini 51"],
  },
  {
    marca: "BWA",
    settore: "motore",
    modelli: ["19 Sport", "22 Sport", "24 Sport", "28 Sport", "30 GT", "32 GT", "35 GT", "750", "850", "950", "40", "42", "Seven", "Nine"],
  },
  {
    marca: "Marlin",
    settore: "motore",
    modelli: ["16", "18", "20", "22", "24", "25", "28", "305", "350", "405", "22 Dynamic", "24 Sundeck"],
  },
  {
    marca: "Boston Whaler",
    settore: "motore",
    modelli: ["130 Super Sport", "150 Super Sport", "170 Montauk", "190 Montauk", "210 Montauk", "230 Outrage", "250 Outrage", "280 Outrage", "320 Outrage", "330 Outrage", "345 Conquest", "380 Outrage", "420 Outrage", "270 Dauntless", "240 Vantage"],
  },
  {
    marca: "Sea Ray",
    settore: "motore",
    modelli: ["SPX 190", "SPX 210", "SPX 230", "SDX 250", "SDX 270", "SDX 290", "Sundancer 265", "Sundancer 320", "Sundancer 370", "Sundancer 400", "SLX 260", "SLX 280", "SLX 310"],
  },
  {
    marca: "Bayliner",
    settore: "motore",
    modelli: ["VR4", "VR5", "VR6", "V20", "V22", "Element E16", "Element E18", "Element E21", "Element E5", "T22", "T24", "DX2000", "DX2200"],
  },
  {
    marca: "Yamaha",
    settore: "motore",
    modelli: ["AR190", "AR195", "AR210", "AR240", "AR250", "SX190", "SX195", "SX210", "SX240", "212X", "212S", "222XD", "252SE", "275SD", "FSH 210", "FSH 255"],
  },
  {
    marca: "Highfield",
    settore: "motore",
    modelli: ["Classic 260", "Classic 290", "Classic 310", "Classic 340", "Classic 360", "Classic 380", "Classic 420", "Sport 330", "Sport 360", "Sport 390", "Sport 420", "Sport 460", "Deluxe 360", "Patrol 420", "Patrol 500"],
  },
  {
    marca: "AB Inflatables",
    settore: "motore",
    modelli: ["Oceanus 10", "Oceanus 11", "Oceanus 13", "Nautilus 11", "Nautilus 13", "Nautilus 15", "Lammina 9", "Lammina 10", "Lammina 12", "Alumina 10", "Ventus 10", "Profile A9"],
  },
  {
    marca: "Italcraft",
    settore: "motore",
    modelli: ["C43", "C50", "C54", "X-Tender 43", "Drago 34", "Drago 38", "42", "46", "50", "54"],
  },
  {
    marca: "Rizzardi",
    settore: "motore",
    modelli: ["CR 63", "CR 73", "CR 74", "Incredible 45", "Incredible 52", "Top Line 40", "Top Line 45", "G500", "44", "50"],
  },
  {
    marca: "Cayman",
    settore: "motore",
    modelli: ["33", "36", "37", "40", "43", "48", "50", "S450", "S520", "Yacht 55"],
  },
  {
    marca: "Pardo",
    settore: "motore",
    modelli: ["38", "43", "50", "50 Walkaround", "60", "75", "GT 52", "GT 75", "Endurance 60", "E60"],
  },
  {
    marca: "Fjord",
    settore: "motore",
    modelli: ["36 Open", "36 Xpress", "38 Xpress", "40 Open", "41 XL", "41 Xpress", "44 Coupe", "44 Open", "48 Open", "53 XL"],
  },
  {
    marca: "Windy",
    settore: "motore",
    modelli: ["27 Solano", "31 Zonda", "32 Grand Zonda", "37 Grand Mistral", "39 Camira", "40 Bora", "44 Chinook", "46 Chinook", "48 Khamsin", "52 Xanthos", "SR44", "SR52"],
  },
  {
    marca: "Galeon",
    settore: "motore",
    modelli: ["305 HTS", "310 HTC", "325 HTS", "335 HTS", "360 Fly", "370 HTS", "380 Fly", "400 Fly", "410 HTC", "420 Fly", "430 Skydeck", "460 Fly", "500 Fly", "510 Skydeck", "550 Fly", "640 Fly", "680 Fly"],
  },
  {
    marca: "Greenline",
    settore: "motore",
    modelli: ["33", "39", "40", "45 Fly", "45 Coupe", "48 Coupe", "48 Fly", "58 Fly", "58 Coupe", "6G", "7G", "8G"],
  },
  {
    marca: "Absolute",
    settore: "motore",
    modelli: ["47 Fly", "50 Fly", "52 Fly", "56 Fly", "60 Fly", "62 Fly", "68 Fly", "72 Fly", "Navetta 48", "Navetta 52", "Navetta 58", "Navetta 64", "48 Coupe", "56 Coupe"],
  },
  {
    marca: "Prestige",
    settore: "motore",
    modelli: ["420", "420 Fly", "460", "460 Fly", "520", "520 Fly", "590", "680", "690", "750", "X60", "X70", "M48"],
  },
  {
    marca: "Vanquish",
    settore: "motore",
    modelli: ["VQ40", "VQ43", "VQ45", "VQ48", "VQ50", "VQ52", "VQ54", "VQ55", "VQ58", "VQ60", "40"],
  },
  {
    marca: "Cigarette Racing",
    settore: "motore",
    modelli: ["38 Top Gun", "42 Tiger", "50 Marauder", "35", "38", "39", "42", "46", "52", "59"],
  },
  {
    marca: "Hatteras",
    settore: "motore",
    modelli: ["GT45", "GT54", "GT59", "GT63", "GT70", "45", "60", "70", "80", "M90"],
  },
  {
    marca: "Bertram",
    settore: "motore",
    modelli: ["28", "31", "35", "39", "50", "60", "61", "64", "35 Flybridge", "39 Express"],
  },
  {
    marca: "Mochi Craft",
    settore: "motore",
    modelli: ["Dolphin 44", "Dolphin 54", "Dolphin 64", "Dolphin 74", "Long Range 23", "Long Range 26", "Long Range 33"],
  },
  {
    marca: "Apreamare",
    settore: "motore",
    modelli: ["Gozzo 35", "Gozzo 38", "Gozzo 45", "Sorrento 9", "Sorrento 11", "7", "9", "11", "12", "45", "48", "54", "66"],
  },
  {
    marca: "Fratelli Aprea",
    settore: "motore",
    modelli: ["Sorrento 32", "Sorrento 36", "Sorrento 38", "Sorrento 45", "Aprea Mare 7.50", "Aprea Mare 9.00", "Gozzo 7.50", "Gozzo 9.50", "750", "850"],
  },
  {
    marca: "Tornado",
    settore: "motore",
    modelli: ["38", "42", "45", "48", "50", "55", "Chase 38", "720", "800"],
  },
  {
    marca: "Altamarea",
    settore: "motore",
    modelli: ["22", "24", "26", "28", "30", "Wave 22", "Wave 24", "Wave 26", "Speed 28"],
  },
  {
    marca: "Scanner",
    settore: "motore",
    modelli: ["26", "32", "36", "40", "43", "45", "46", "50", "58", "Envy 36", "Envy 40"],
  },
  {
    marca: "Tecnorib",
    settore: "motore",
    modelli: ["Pirelli 35", "Pirelli 42", "Pirelli 50", "Pirelli 880", "Pirelli 1000", "Pirelli 1100", "Pirelli 1400", "Pirelli Speed 880", "Rebel 40", "Rebel 47"],
  },
  {
    marca: "Anvera",
    settore: "motore",
    modelli: ["36", "42", "42 S", "48", "48 S", "55", "55 S", "4.2", "5.8"],
  },
  {
    marca: "Nuova Jolly",
    settore: "motore",
    modelli: ["Prince 21", "Prince 24", "Prince 28", "Prince 30", "Prince 33", "Prince 35", "Prince 38", "King 24", "King 28", "King 32", "NJ 650", "NJ 750"],
  },
  {
    marca: "As Marine",
    settore: "motore",
    modelli: ["Zeta 600", "Zeta 700", "Zeta 800", "Athos 22", "Athos 24", "AS 18", "AS 20", "AS 22", "AS 24", "AS 26", "AS 28", "AS 30"],
  },
  {
    marca: "Beneteau",
    settore: "entrambi",
    modelli: ["Oceanis 30.1", "Oceanis 34.1", "Oceanis 37.1", "Oceanis 40.1", "Oceanis 46.1", "Oceanis 51.1", "First 27", "First 36", "First 44", "First 53", "Antares 8", "Antares 11", "Gran Turismo 41", "Swift Trawler 41", "Flyer 8"],
  },
  {
    marca: "Jeanneau",
    settore: "entrambi",
    modelli: ["Sun Odyssey 319", "Sun Odyssey 349", "Sun Odyssey 380", "Sun Odyssey 410", "Sun Odyssey 440", "Sun Odyssey 490", "Sun Fast 3200", "Sun Fast 3300", "Sun Fast 3600", "Cap Camarat 6.5", "Cap Camarat 7.5", "Cap Camarat 9.0", "Merry Fisher 795", "Merry Fisher 895", "NC 37", "NC 41"],
  },
  {
    marca: "Bavaria",
    settore: "entrambi",
    modelli: ["C38", "C42", "C45", "C50", "C57", "Cruiser 34", "Cruiser 37", "Cruiser 41", "Cruiser 46", "Cruiser 51", "Vision 42", "Vision 46", "SR33", "SR41", "Sport 400", "R40"],
  },
  {
    marca: "Dufour",
    settore: "vela",
    modelli: ["32", "34", "37", "44", "310", "350", "360", "380", "390", "412", "430", "460", "470", "530", "56"],
  },
  {
    marca: "Hanse",
    settore: "vela",
    modelli: ["315", "320", "345", "348", "370", "388", "418", "458", "460", "508", "510", "548", "588", "590", "675"],
  },
  {
    marca: "Elan",
    settore: "vela",
    modelli: ["Impression 40", "Impression 40.1", "Impression 43.1", "Impression 44", "Impression 45.1", "Impression 50", "Impression 50.1", "GT5", "GT6", "E4", "E5", "E6", "344", "394", "444"],
  },
  {
    marca: "Grand Soleil",
    settore: "vela",
    modelli: ["34", "39", "42", "44", "46", "50", "52", "54", "60", "72", "Blue", "LC 46", "GS 40", "GS 42"],
  },
  {
    marca: "Comar",
    settore: "vela",
    modelli: ["Genesi 43", "38", "40", "43", "46", "52", "60", "Raven 40", "Raven 45", "Sunrise 38"],
  },
  {
    marca: "Catalina",
    settore: "vela",
    modelli: ["5", "12", "14", "275", "315", "320", "355", "375", "385", "425", "445", "470", "545"],
  },
  {
    marca: "Dehler",
    settore: "vela",
    modelli: ["29", "30", "32", "34", "34 SV", "36", "38", "38 SQ", "42", "46", "46 SQ", "48"],
  },
  {
    marca: "Salona",
    settore: "vela",
    modelli: ["33", "35", "37", "38", "41", "42", "44", "45", "46", "60", "S33", "S38", "S45"],
  },
  {
    marca: "X-Yachts",
    settore: "vela",
    modelli: ["X4.0", "X4.3", "X4.6", "X4.9", "X5.6", "X56", "X6.5", "X7", "Xc 35", "Xc 38", "Xc 42", "Xc 45", "Xc 47", "Xp 44", "Xp 50"],
  },
  {
    marca: "Hallberg-Rassy",
    settore: "vela",
    modelli: ["310", "340", "342", "37", "372", "39", "40", "400", "412", "43", "44", "46", "48", "54", "64"],
  },
  {
    marca: "Sweden Yachts",
    settore: "vela",
    modelli: ["340", "370", "390", "42", "45", "45 Regina", "50", "54", "54 Regina", "60", "70"],
  },
  {
    marca: "Amel",
    settore: "vela",
    modelli: ["50", "54", "55", "60", "64", "Super Maramu", "Maramu", "Santorin", "Mango", "Kirk", "Euros"],
  },
  {
    marca: "Nautor Swan",
    settore: "vela",
    modelli: ["42", "45", "48", "51", "53", "54", "58", "60", "65", "70", "78", "88", "98", "108", "115"],
  },
  {
    marca: "Solaris",
    settore: "vela",
    modelli: ["40", "42", "44", "47", "50", "55", "58", "60", "64", "68", "72", "80"],
  },
  {
    marca: "Italia Yachts",
    settore: "vela",
    modelli: ["9.98", "11.98", "12.98", "13.98", "14.98", "15.98", "9.98 Fuoriserie", "11.98 Fuoriserie", "13.98 Fuoriserie"],
  },
  {
    marca: "Comet Yachts",
    settore: "vela",
    modelli: ["21", "26", "28", "33", "37", "38", "41", "45", "46", "50"],
  },
  {
    marca: "Maxi Yachts",
    settore: "vela",
    modelli: ["84", "95", "999", "1000", "1050", "1200", "1300"],
  },
  {
    marca: "Oyster",
    settore: "vela",
    modelli: ["46", "475", "495", "545", "565", "595", "625", "675", "745", "885"],
  },
  {
    marca: "Moody",
    settore: "vela",
    modelli: ["34", "36", "41", "42", "45", "46", "54", "DS41", "DS45", "DS54"],
  },
  {
    marca: "Southerly",
    settore: "vela",
    modelli: ["32", "38", "42", "47", "110", "420", "480", "535", "46RS", "57"],
  },
  {
    marca: "Lagoon",
    settore: "vela",
    modelli: ["40", "42", "46", "46 Fly", "50", "51", "51 Fly", "52 F", "55", "60", "65", "77"],
  },
  {
    marca: "Fountaine Pajot",
    settore: "entrambi",
    modelli: ["Isla 40", "Astrea 42", "Elba 45", "Tanna 47", "Saona 47", "Aura 51", "Samana 59", "Alegria 67", "MY4.S", "MY5", "MY6", "MY40", "Power 67"],
  },
  {
    marca: "Leopard Catamarans",
    settore: "vela",
    modelli: ["40", "42", "44", "45", "46", "48", "50", "51", "53", "58", "43 PC", "46 PC"],
  },
  {
    marca: "Bali",
    settore: "vela",
    modelli: ["4.0", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.8", "5.4", "5.8", "Catspace", "Catsmart"],
  },
  {
    marca: "Nautitech",
    settore: "vela",
    modelli: ["40 Open", "44 Open", "46 Open", "47 Open", "441", "475", "482", "542"],
  },
  {
    marca: "Excess",
    settore: "vela",
    modelli: ["11", "12", "12 Open", "14", "14 Sun", "15"],
  },
  {
    marca: "Catana",
    settore: "vela",
    modelli: ["42", "47", "50", "53", "59", "62", "401", "431", "471", "521", "531"],
  },
  {
    marca: "Wally",
    settore: "entrambi",
    modelli: ["80", "100", "101", "107", "130", "145", "Barong", "Esense", "WHY150", "WHY200", "Wallypower 58", "Wallypower 118", "Wallytender 43", "Wallytender 48"],
  },
];

function normalizza(testo: string): string {
  return testo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function cercaModelli(testo: string, limite = 30): { marca: string; modello: string }[] {
  const query = normalizza(testo.trim());
  const tetto = query === "" ? Math.min(limite, 50) : limite;
  const risultati: { marca: string; modello: string }[] = [];

  for (const voce of MARCHE_BARCHE) {
    for (const modello of voce.modelli) {
      const corrisponde =
        query === "" || normalizza(voce.marca).includes(query) || normalizza(modello).includes(query);
      if (corrisponde) {
        risultati.push({ marca: voce.marca, modello });
        if (risultati.length >= tetto) return risultati;
      }
    }
  }

  return risultati;
}
