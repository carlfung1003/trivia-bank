/* ==========================================================================
   Expand the bank with themed question sets.
   Usage:  node scripts/add-questions.mjs [--dry]

   Idempotent: entries are keyed by question text, so re-running updates in
   place rather than duplicating. New ids continue from the bank's current
   maximum.

   Validated on write, with the same rule the other author-* scripts enforce:
   a hint must never contain its own answer or an accepted alias.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const bankPath = join(here, "..", "data", "questions.json");
const bank = JSON.parse(readFileSync(bankPath, "utf8"));
const dry = process.argv.includes("--dry");

const NEW_CATEGORIES = ["Signs & Symbols", "Landmarks & Wonders", "Horror & Hauntings", "Numbers & Puzzles"];

const draft = [];
const Q = (category, question, answer, accept, difficulty, hint) =>
  draft.push({ category, question, answer, accept, difficulty, hint });

const S = (q, a, acc, d, h) => Q("Signs & Symbols", q, a, acc, d, h);
const L = (q, a, acc, d, h) => Q("Landmarks & Wonders", q, a, acc, d, h);
const H = (q, a, acc, d, h) => Q("Horror & Hauntings", q, a, acc, d, h);
const N = (q, a, acc, d, h) => Q("Numbers & Puzzles", q, a, acc, d, h);

/* ---- Signs & Symbols ---------------------------------------------------- */
S("Which zodiac sign is represented by the ram?", "Aries", ["aries"], "easy",
  "First in the zodiac, and it shares its ruling planet with the red one.");
S("Which zodiac sign is represented by the bull?", "Taurus", ["taurus"], "easy",
  "An earth sign ruled by Venus, and stubborn about it.");
S("Which zodiac sign is represented by the twins?", "Gemini", ["gemini"], "easy",
  "Named for Castor and Pollux, and ruled by Mercury.");
S("Which zodiac sign is represented by the crab?", "Cancer", ["cancer"], "easy",
  "The only sign ruled by the Moon.");
S("Which zodiac sign is represented by the lion?", "Leo", ["leo"], "easy",
  "The only sign ruled by the Sun.");
S("Which zodiac sign is represented by the maiden?", "Virgo", ["virgo"], "easy",
  "An earth sign associated with harvest and with fussiness.");
S("Which zodiac sign is represented by the scorpion?", "Scorpio", ["scorpio"], "easy",
  "A water sign, and modern astrology gives it Pluto.");
S("Which zodiac sign is represented by the archer?", "Sagittarius", ["sagittarius"], "medium",
  "Half horse, half man, and ruled by Jupiter.");
S("Which zodiac sign is represented by the sea-goat?", "Capricorn", ["capricorn"], "medium",
  "Ruled by Saturn, and it covers Christmas and New Year.");
S("Which zodiac sign is represented by the water bearer?", "Aquarius", ["aquarius"], "medium",
  "Despite the water in the name, it is an air sign.");
S("Which zodiac sign is represented by two fish?", "Pisces", ["pisces"], "easy",
  "Last in the zodiac, and the two swim in opposite directions.");
S("How many signs are there in the Western zodiac?", "Twelve", ["twelve","12"], "easy",
  "One for roughly each month, and the same count as the Chinese cycle.");
S("Aries, Leo and Sagittarius all belong to which element?", "Fire", ["fire"], "medium",
  "The element associated with drive and temper.");
S("Cancer, Scorpio and Pisces all belong to which element?", "Water", ["water"], "medium",
  "The element associated with emotion and intuition.");
S("Taurus, Virgo and Capricorn all belong to which element?", "Earth", ["earth"], "medium",
  "The practical, grounded element.");
S("Gemini, Libra and Aquarius all belong to which element?", "Air", ["air"], "medium",
  "The element associated with intellect and communication.");
S("In astrology, what is the sign rising on the eastern horizon at your birth called?", "The ascendant", ["ascendant","rising sign","the rising sign"], "medium",
  "Said to govern the impression you make before you speak.");
S("Which planet is said to govern communication, and is blamed when it appears to move backwards?", "Mercury", ["mercury"], "easy",
  "The closest planet to the Sun, and the fastest.");
S("What is the term for a planet's apparent backward motion across the sky?", "Retrograde", ["retrograde","retrograde motion"], "medium",
  "An optical effect of two orbits passing, not the planet reversing.");
S("What is the astrological chart of the sky at the exact moment of your birth called?", "A natal chart", ["natal chart","birth chart","a birth chart"], "medium",
  "It cannot be cast without your exact time of birth.");
S("How many animals are in the Chinese zodiac cycle?", "Twelve", ["twelve","12"], "easy",
  "The same count as the Western zodiac, but one per year rather than per month.");
S("Which animal comes first in the Chinese zodiac?", "The rat", ["rat","the rat"], "medium",
  "In the legend it rode across the river on the ox's back and jumped off first.");
S("Which familiar household animal is famously absent from the Chinese zodiac?", "The cat", ["cat","the cat"], "medium",
  "The legend blames the rat for not waking it in time.");
S("The Chinese zodiac pairs its animals with how many elements?", "Five", ["five","5"], "hard",
  "Wood, fire, earth, metal and water, giving a sixty-year cycle.");
S("Which thirteenth constellation does the Sun pass through, though it is left out of the zodiac?", "Ophiuchus", ["ophiuchus"], "hard",
  "The serpent bearer, sitting between Scorpio and Sagittarius.");
S("How many deadly sins are there in Christian tradition?", "Seven", ["seven","7"], "easy",
  "The same number as the virtues that oppose them.");
S("Which deadly sin is defined as excessive pride in oneself?", "Pride", ["pride","vanity"], "medium",
  "Traditionally considered the root of the other six.");
S("Which deadly sin corresponds to extreme laziness?", "Sloth", ["sloth"], "easy",
  "It shares its name with a slow-moving Central American mammal.");
S("Breaking a mirror is said to bring how many years of bad luck?", "Seven", ["seven","7"], "easy",
  "The Romans believed life renewed itself on that cycle.");
S("What is the fear of Friday the 13th called?", "Paraskevidekatriaphobia", ["paraskevidekatriaphobia","friggatriskaidekaphobia"], "hard",
  "It builds on the Greek for Friday and the general fear of the number.");
S("A baker's dozen is how many?", "Thirteen", ["thirteen","13"], "easy",
  "One more than a dozen, added so bakers avoided penalties for short weight.");
S("How many cards are in each suit of a standard deck?", "Thirteen", ["thirteen","13"], "easy",
  "Ace through king, and four suits make fifty-two.");
S("How many stripes are on the flag of the United States?", "Thirteen", ["thirteen","13"], "easy",
  "One for each of the original colonies.");
S("Throwing which seasoning over your left shoulder is said to ward off bad luck?", "Salt", ["salt"], "easy",
  "It was once valuable enough that spilling it was a genuine loss.");
S("In Buddhist tradition, how many beads are on a full mala?", "108", ["108","one hundred and eight"], "hard",
  "The same number of times temple bells are rung at Japanese New Year.");
/* ---- Landmarks & Wonders ------------------------------------------------- */
L("Machu Picchu sits in the mountains of which country?", "Peru", ["peru"], "easy",
  "The Andes, and the nearest city is Cusco.");
L("In which city does the Eiffel Tower stand?", "Paris", ["paris"], "easy",
  "Built for the 1889 World's Fair and meant to be temporary.");
L("Christ the Redeemer overlooks which city?", "Rio de Janeiro", ["rio","rio de janeiro","rio de janeiro brazil"], "easy",
  "It stands on Corcovado mountain, arms open over the bay.");
L("The Catacombs, holding the remains of six million people, run beneath which capital?", "Paris", ["paris"], "medium",
  "Former limestone quarries, filled when the city's cemeteries overflowed.");
L("The rock-cut city of Petra is in which country?", "Jordan", ["jordan"], "medium",
  "Carved by the Nabataeans; the Treasury facade closes a narrow gorge.");
L("Chichén Itzá and its stepped pyramid are in which country?", "Mexico", ["mexico"], "medium",
  "Built by the Maya on the Yucatán Peninsula.");
L("The Taj Mahal was built in which country?", "India", ["india"], "easy",
  "A mausoleum in Agra, built by Shah Jahan for his wife.");
L("Which is the only one of the Seven Wonders of the Ancient World still standing?", "The Great Pyramid of Giza", ["great pyramid","the great pyramid","great pyramid of giza","pyramid of giza","the great pyramid of giza"], "medium",
  "It was the tallest structure on Earth for about 3,800 years.");
L("The Hanging Gardens, one of the ancient wonders, were said to be in which city?", "Babylon", ["babylon"], "medium",
  "In present-day Iraq, and no archaeological trace has ever been found.");
L("The Colossus, a giant bronze statue among the ancient wonders, stood on which Greek island?", "Rhodes", ["rhodes"], "hard",
  "It stood barely fifty years before an earthquake felled it.");
L("Stonehenge stands in which country?", "England", ["england"], "easy",
  "On Salisbury Plain; some of its stones came from Wales.");
L("The Colosseum is in which city?", "Rome", ["rome"], "easy",
  "It held perhaps fifty thousand spectators and could be flooded.");
L("The Leaning Tower stands in which Italian city?", "Pisa", ["pisa"], "easy",
  "It is the bell tower of the city's cathedral, and it began tilting during construction.");
L("The Acropolis and its Parthenon overlook which capital?", "Athens", ["athens"], "easy",
  "The temple was dedicated to the goddess the city is named for.");
L("The Alhambra palace complex is in which Spanish city?", "Granada", ["granada"], "medium",
  "A Moorish fortress-palace in Andalusia, with the Court of the Lions.");
L("Neuschwanstein Castle, the model for Disney's fairytale castle, is in which country?", "Germany", ["germany"], "medium",
  "Built in Bavaria for Ludwig II, and never finished.");
L("The Brandenburg Gate stands in which city?", "Berlin", ["berlin"], "easy",
  "It stood in the no-man's-land beside the Wall for 28 years.");
L("The Little Mermaid statue sits in the harbour of which capital?", "Copenhagen", ["copenhagen"], "medium",
  "Based on a Hans Christian Andersen story, and smaller than visitors expect.");
L("The Manneken Pis fountain is a landmark of which capital?", "Brussels", ["brussels"], "hard",
  "A small bronze boy who is dressed in costumes hundreds of times a year.");
L("Hagia Sophia and the Blue Mosque face each other in which city?", "Istanbul", ["istanbul"], "medium",
  "One was a cathedral, then a mosque, then a museum, then a mosque again.");
L("St Basil's Cathedral, with its swirling coloured domes, stands on which square?", "Red Square", ["red square"], "medium",
  "In Moscow, at the edge of the Kremlin.");
L("The Forbidden City is in which capital?", "Beijing", ["beijing","peking"], "easy",
  "Nearly a thousand buildings, home to emperors for five centuries.");
L("The Terracotta Army was buried near which Chinese city?", "Xi'an", ["xian","xi an","xi'an"], "medium",
  "Discovered by farmers digging a well in 1974.");
L("Mount Fuji is the highest peak of which country?", "Japan", ["japan"], "easy",
  "An active volcano, and a pilgrimage site for centuries.");
L("The Petronas Towers stand in which capital?", "Kuala Lumpur", ["kuala lumpur","kl"], "medium",
  "Twin towers joined by a skybridge; they were the world's tallest until 2004.");
L("The Burj Khalifa, the world's tallest building, is in which city?", "Dubai", ["dubai"], "easy",
  "It passed 828 metres and opened in 2010.");
L("The moai, giant carved stone heads, stand on which remote island?", "Easter Island", ["easter island","rapa nui"], "medium",
  "It belongs to Chile, and lies over 3,000 km from the mainland.");
L("Uluru, the great sandstone monolith, is in which country?", "Australia", ["australia"], "easy",
  "Sacred to the Anangu people, and once called Ayers Rock.");
L("Victoria Falls lies on the border between Zambia and which country?", "Zimbabwe", ["zimbabwe"], "medium",
  "The local name means 'the smoke that thunders'.");
L("Table Mountain overlooks which South African city?", "Cape Town", ["cape town"], "medium",
  "Its flat top gathers a cloud locals call the tablecloth.");
L("Mount Rushmore is carved into a mountain in which US state?", "South Dakota", ["south dakota"], "medium",
  "Four presidents, in the Black Hills.");
L("The Golden Gate Bridge spans the entrance to which bay?", "San Francisco Bay", ["san francisco bay","san francisco"], "easy",
  "Its colour is officially called International Orange.");
L("On which island does the Statue of Liberty stand?", "Liberty Island", ["liberty island","bedloe's island"], "medium",
  "Renamed in 1956; it sits in New York Harbor.");
L("Iguazu Falls straddles the border of Brazil and which country?", "Argentina", ["argentina"], "medium",
  "Hundreds of cascades, and the largest is called the Devil's Throat.");
L("The Salar de Uyuni, the world's largest salt flat, is in which country?", "Bolivia", ["bolivia"], "hard",
  "When a thin layer of water covers it, it becomes an enormous mirror.");
L("The Great Sphinx sits beside the pyramids in which country?", "Egypt", ["egypt"], "easy",
  "A lion's body with a human head, on the Giza plateau.");
L("The Trevi Fountain is in which city?", "Rome", ["rome"], "easy",
  "Tradition says a coin thrown over the shoulder brings you back.");
L("Which Cambodian temple complex appears on its country's national flag?", "Angkor Wat", ["angkor wat","angkor"], "medium",
  "The only building to feature on any national flag.");
/* ---- Horror & Hauntings -------------------------------------------------- */
H("Which 1973 film about the possession of a young girl is often called the scariest ever made?", "The Exorcist", ["exorcist","the exorcist"], "easy",
  "It was the first horror film nominated for the Best Picture Oscar.");
H("Which 1978 John Carpenter film introduced the masked killer Michael Myers?", "Halloween", ["halloween"], "easy",
  "Shot for around $300,000, and its synth theme is in 5/4 time.");
H("Who is the masked killer of the Friday the 13th franchise?", "Jason Voorhees", ["jason","jason voorhees"], "easy",
  "He does not actually wear the hockey mask until the third film.");
H("Which horror villain stalks his victims in their dreams?", "Freddy Krueger", ["freddy","freddy krueger"], "easy",
  "A striped jumper, a burned face, and a bladed glove.");
H("Which 1999 found-footage film was marketed as real recovered tapes?", "The Blair Witch Project", ["blair witch","the blair witch project","blair witch project"], "medium",
  "Made for about $60,000 in the woods of Maryland.");
H("Which Stephen King novel features the shape-shifting entity Pennywise?", "It", ["it"], "easy",
  "The children who face it call themselves the Losers' Club.");
H("Which 2017 Jordan Peele film won him the Oscar for Best Original Screenplay?", "Get Out", ["get out"], "medium",
  "The Sunken Place, a teacup, and a very uncomfortable weekend away.");
H("Which 1968 George Romero film established the modern zombie?", "Night of the Living Dead", ["night of the living dead"], "medium",
  "Shot in black and white in Pennsylvania; it fell into the public domain.");
H("Which 1922 German silent film was an unauthorised adaptation of Dracula?", "Nosferatu", ["nosferatu"], "medium",
  "Stoker's estate sued and most prints were ordered destroyed.");
H("Who wrote the 1897 novel Dracula?", "Bram Stoker", ["bram stoker","stoker"], "easy",
  "An Irish theatre manager who never visited Transylvania.");
H("Which Japanese horror film centres on a videotape that kills its viewer in seven days?", "Ringu", ["ringu","ring","the ring"], "medium",
  "Remade in Hollywood in 2002; the ghost climbs out of a well.");
H("Which 2016 South Korean film traps passengers with zombies on a train?", "Train to Busan", ["train to busan","busan"], "medium",
  "The journey runs from Seoul to a southern port city.");
H("Which mask is worn by the killer in the Scream franchise?", "Ghostface", ["ghostface","the ghostface mask"], "medium",
  "Its design was inspired by a Munch painting.");
H("Which 1976 film, from a Stephen King novel, ends with a prom drenched in pig's blood?", "Carrie", ["carrie"], "medium",
  "Brian De Palma directed; Sissy Spacek was Oscar-nominated for it.");
H("Which 2018 Ari Aster film features a dollhouse, a decapitation and a cult?", "Hereditary", ["hereditary"], "hard",
  "Toni Collette's performance was widely called an Oscar snub.");
H("Which paranormal investigators, played by Vera Farmiga and Patrick Wilson, anchor The Conjuring films?", "Ed and Lorraine Warren", ["the warrens","ed and lorraine warren","warrens"], "hard",
  "A real married couple who also investigated the Amityville case.");
H("Which everyday object was modified into Michael Myers' mask in Halloween?", "A Captain Kirk mask", ["captain kirk mask","a captain kirk mask","william shatner mask","star trek mask"], "hard",
  "Bought cheaply, painted white, and the eyeholes widened.");
H("What is the term for a person who transforms into a wolf?", "A werewolf", ["werewolf","lycanthrope","a lycanthrope"], "easy",
  "Traditionally the change comes with the full moon.");
H("In Mary Shelley's novel, what is the name of Frankenstein's creation?", "It has no name", ["no name","nameless","it has no name","the creature","the monster","unnamed"], "medium",
  "Victor is the scientist; the thing he makes is only ever called creature, wretch or fiend.");
H("Which vegetable was carved into lanterns before pumpkins took over?", "The turnip", ["turnip","the turnip","turnips"], "medium",
  "An Irish tradition, and pumpkins proved far easier to hollow out.");
H("On which date is Halloween observed?", "31 October", ["31 october","october 31","31st october","oct 31"], "easy",
  "The eve of All Saints' Day.");
H("Which Mexican holiday honours the dead with marigolds, altars and sugar skulls?", "Day of the Dead", ["day of the dead","dia de muertos","dia de los muertos"], "easy",
  "Observed on the first two days of November.");
H("What is the term for a spirit said to move objects and make noise?", "A poltergeist", ["poltergeist","a poltergeist"], "medium",
  "German for 'noisy ghost'.");
H("What is the affectionate nickname for the supposed monster of Loch Ness?", "Nessie", ["nessie"], "easy",
  "The famous 1934 'surgeon's photograph' was admitted to be a hoax.");
H("Which large ape-like creature is said to roam the forests of the Pacific Northwest?", "Bigfoot", ["bigfoot","sasquatch"], "easy",
  "The 1967 Patterson-Gimlin film is its most famous supposed footage.");
H("Which cryptid's name translates from Spanish as 'goat sucker'?", "The chupacabra", ["chupacabra","the chupacabra"], "medium",
  "Reports began in Puerto Rico in the mid-1990s.");
H("Which faceless, long-limbed figure in a suit began as a 2009 internet photo contest entry?", "Slender Man", ["slender man","slenderman"], "medium",
  "The first creepypasta character to escape into mainstream panic.");
H("What is the term for the unease provoked by something almost, but not quite, human?", "The uncanny valley", ["uncanny valley","the uncanny valley"], "hard",
  "Named by roboticist Masahiro Mori in 1970, after a dip in a graph.");
H("Which stretch of the western Atlantic is blamed for unexplained disappearances of ships and planes?", "The Bermuda Triangle", ["bermuda triangle","the bermuda triangle"], "easy",
  "Also called the Devil's Triangle; insurers do not treat it as unusual.");
H("Which 1980 Kubrick film has a boy riding a tricycle down an empty hotel corridor?", "The Shining", ["the shining","shining"], "easy",
  "Stephen King famously disliked this adaptation of his own novel.");
H("Which creature is traditionally repelled by garlic, running water and sunlight?", "The vampire", ["vampire","a vampire","vampires"], "easy",
  "Folklore across the Balkans long predates the Gothic novel version.");
H("Which 2014 Australian film features a children's book character in a top hat?", "The Babadook", ["babadook","the babadook"], "hard",
  "Its title creature later became an unlikely queer icon.");
/* ---- Numbers & Puzzles --------------------------------------------------- */
N("What is the only even prime number?", "2", ["2","two"], "medium",
  "Every other even number has it as a factor, which disqualifies them.");
N("What is pi to two decimal places?", "3.14", ["3.14","314"], "easy",
  "Celebrated each year on the fourteenth of March.");
N("What is the value of zero factorial?", "1", ["1","one"], "hard",
  "Defined so that the formula for combinations keeps working.");
N("What is the approximate value of the golden ratio?", "1.618", ["1.618","1.62","phi"], "hard",
  "Denoted by a Greek letter, and the Fibonacci ratios converge on it.");
N("How many zeros are in a googol?", "100", ["100","a hundred","one hundred"], "medium",
  "The search engine misspelled it on purpose.");
N("What is the sum of the whole numbers from 1 to 100?", "5050", ["5050","5,050"], "hard",
  "Gauss reportedly worked it out as a schoolboy by pairing the ends.");
N("What is the term for a number divisible only by 1 and itself?", "A prime number", ["prime","a prime","prime number","a prime number"], "easy",
  "Euclid proved there are infinitely many of them.");
N("What is the smallest perfect number?", "6", ["6","six"], "hard",
  "Its divisors 1, 2 and 3 add up to itself.");
N("What is 2 to the power of 10?", "1024", ["1024","1,024"], "medium",
  "The reason a kilobyte is not quite a thousand bytes.");
N("Which Roman numeral represents 1000?", "M", ["m"], "easy",
  "From the Latin 'mille'.");
N("Which Roman numeral represents 50?", "L", ["l"], "medium",
  "It sits between X and C.");
N("How many items are in a gross?", "144", ["144"], "medium",
  "A dozen dozen.");
N("How many degrees are in the interior angles of a triangle?", "180", ["180","180 degrees"], "easy",
  "Half a full turn, and it holds only on a flat surface.");
N("Which number is the only one spelled with its letters in alphabetical order in English?", "Forty", ["forty","40"], "hard",
  "F, o, r, t, y — and one is the only number spelled in reverse alphabetical order.");
N("In the Fibonacci sequence, which two numbers does it begin with?", "0 and 1", ["0 and 1","1 and 1","zero and one","0 1"], "medium",
  "Each term after that is the sum of the two before it.");
N("What is the sum of all the numbers on a roulette wheel?", "666", ["666"], "hard",
  "Which is why it is sometimes called the Devil's wheel.");
N("How many people must be in a room for a shared birthday to be more likely than not?", "23", ["23","twenty three","twenty-three"], "hard",
  "Far fewer than most people guess, because it counts pairs rather than matches to one person.");
N("What is Euler's number to two decimal places?", "2.72", ["2.72","2.718","e"], "hard",
  "The base of natural logarithms, written as a single letter.");
N("What is the largest single-digit prime number?", "7", ["7","seven"], "easy",
  "Eight and nine both have factors.");
N("In the Monty Hall problem, should you switch doors after one is opened?", "Yes", ["yes","switch","you should switch"], "hard",
  "Switching wins two times in three, which almost nobody believes at first.");
N("What is the term for the result of a division?", "The quotient", ["quotient","the quotient"], "medium",
  "The number being divided is the dividend.");
N("What is a number that reads the same in both directions called?", "A palindromic number", ["palindromic number","a palindromic number","palindrome","a palindrome"], "medium",
  "12321 qualifies; so does every single digit.");
N("How many faces does a standard six-sided die have in total, counting all pips?", "21", ["21","twenty one","twenty-one"], "medium",
  "The numbers one through six, added together.");
N("What is the mathematical term for a number that cannot be written as a simple fraction?", "An irrational number", ["irrational","irrational number","an irrational number"], "medium",
  "The square root of two was the first one proved.");
/* ---- Science & Nature (expansion) ---------------------------------------- */
/* physics */
Q("Science & Nature", "What is the SI unit of force?", "The newton", ["newton","the newton"], "easy",
  "Named after the man who worked out why apples fall.");
Q("Science & Nature", "What is the SI unit of energy?", "The joule", ["joule","the joule"], "easy",
  "Named after an English brewer who measured heat from work.");
Q("Science & Nature", "What is the SI unit of power?", "The watt", ["watt","the watt"], "easy",
  "Named after the Scot who improved the steam engine.");
Q("Science & Nature", "What is the SI unit of frequency?", "The hertz", ["hertz","the hertz"], "medium",
  "One cycle per second, named after the discoverer of radio waves.");
Q("Science & Nature", "What is the SI unit of electric current?", "The ampere", ["ampere","the ampere","amp"], "medium",
  "Named after a French physicist; the shortened form is on every fuse.");
Q("Science & Nature", "In E=mc squared, what does c represent?", "The speed of light", ["speed of light","the speed of light","light speed"], "easy",
  "Squared, which is why a little mass yields enormous energy.");
Q("Science & Nature", "What is absolute zero in degrees Celsius?", "-273.15", ["-273.15","273.15","-273","minus 273.15"], "hard",
  "The point where a substance has no thermal energy left to give up.");
Q("Science & Nature", "Which subatomic particle in the nucleus carries no electric charge?", "The neutron", ["neutron","the neutron"], "easy",
  "Discovered by Chadwick in 1932, later than its charged neighbour.");
Q("Science & Nature", "What is the bending of light as it passes from air into water called?", "Refraction", ["refraction"], "easy",
  "It is why a straw looks broken in a glass.");
Q("Science & Nature", "Which of Newton's laws states that every action has an equal and opposite reaction?", "The third law", ["third","the third","third law","the third law","newton's third law"], "medium",
  "The one that explains why a gun recoils.");
Q("Science & Nature", "What is the term for materials that conduct electricity with zero resistance?", "Superconductors", ["superconductor","superconductors","superconductivity"], "hard",
  "Most need to be cooled to extraordinarily low temperatures.");
Q("Science & Nature", "Roughly how fast does sound travel through air at sea level?", "343 metres per second", ["343","343 m/s","343 metres per second","343 meters per second"], "hard",
  "About a million times slower than the thing you see first.");
Q("Science & Nature", "Which fundamental force holds the atomic nucleus together?", "The strong nuclear force", ["strong nuclear force","the strong force","strong force","the strong nuclear force"], "medium",
  "It has to beat the electrical repulsion between protons.");
/* chemistry */
Q("Science & Nature", "What is the chemical symbol for iron?", "Fe", ["fe"], "easy",
  "Two letters, from the Latin 'ferrum'.");
Q("Science & Nature", "What is the chemical symbol for sodium?", "Na", ["na"], "easy",
  "Two letters, from the Latin 'natrium'.");
Q("Science & Nature", "What is the chemical symbol for lead?", "Pb", ["pb"], "medium",
  "Two letters, from the Latin 'plumbum' — the root of plumber.");
Q("Science & Nature", "What is the chemical symbol for copper?", "Cu", ["cu"], "medium",
  "Two letters, from the Latin for the island of Cyprus.");
Q("Science & Nature", "What is the chemical name for table salt?", "Sodium chloride", ["sodium chloride","nacl"], "easy",
  "One metal, one halogen, and the reaction between them is violent.");
Q("Science & Nature", "Which element has atomic number 6?", "Carbon", ["carbon"], "easy",
  "Every living thing on Earth is built around it.");
Q("Science & Nature", "What is the term for a substance that speeds up a reaction without being consumed?", "A catalyst", ["catalyst","a catalyst"], "easy",
  "Enzymes are the biological kind.");
Q("Science & Nature", "How many electrons can the innermost electron shell hold?", "2", ["2","two"], "medium",
  "Which is why helium is already full and inert.");
Q("Science & Nature", "Which element is the most electronegative?", "Fluorine", ["fluorine"], "hard",
  "Top right of the periodic table, ignoring the noble gases.");
Q("Science & Nature", "Which noble gas glows orange-red in illuminated signs?", "Neon", ["neon"], "easy",
  "The name is Greek for 'new'.");
Q("Science & Nature", "What is the term for atoms of one element with differing numbers of neutrons?", "Isotopes", ["isotope","isotopes"], "medium",
  "Carbon-14 is the one used for dating.");
Q("Science & Nature", "What gas is usually released when an acid reacts with a metal?", "Hydrogen", ["hydrogen"], "medium",
  "It pops when a lit splint is held to it.");
/* biology */
Q("Science & Nature", "What is the basic structural unit of all living organisms?", "The cell", ["cell","the cell"], "easy",
  "Hooke named them after monks' rooms.");
Q("Science & Nature", "Which protein carries oxygen in the blood?", "Haemoglobin", ["haemoglobin","hemoglobin"], "easy",
  "It contains iron, which is why blood is red.");
Q("Science & Nature", "What is the fluid component of blood called?", "Plasma", ["plasma"], "medium",
  "It makes up more than half the volume and is straw-coloured.");
Q("Science & Nature", "What are the building blocks of proteins?", "Amino acids", ["amino acid","amino acids"], "easy",
  "Twenty of them are standard in the genetic code.");
Q("Science & Nature", "Which base pairs with adenine in DNA?", "Thymine", ["thymine","t"], "medium",
  "In RNA it is replaced by uracil.");
Q("Science & Nature", "What is the cell division that produces gametes called?", "Meiosis", ["meiosis"], "medium",
  "It halves the chromosome count; its sibling process does not.");
Q("Science & Nature", "What is the process of programmed cell death called?", "Apoptosis", ["apoptosis"], "hard",
  "Greek for leaves falling from a tree; cancer cells evade it.");
Q("Science & Nature", "Which organs filter the blood to produce urine?", "The kidneys", ["kidney","kidneys","the kidneys"], "easy",
  "A pair, and you can live with one.");
Q("Science & Nature", "What is the largest part of the human brain?", "The cerebrum", ["cerebrum","the cerebrum"], "medium",
  "Divided into two hemispheres, and it sits above the little brain.");
Q("Science & Nature", "What is the scientific binomial name for modern humans?", "Homo sapiens", ["homo sapiens"], "easy",
  "Latin for 'wise man'.");
Q("Science & Nature", "What is the study of insects called?", "Entomology", ["entomology"], "medium",
  "Easily confused with the study of word origins.");
Q("Science & Nature", "What is the study of birds called?", "Ornithology", ["ornithology"], "medium",
  "From the Greek 'ornis'.");
Q("Science & Nature", "What is the term for an organism that produces its own food from sunlight or chemicals?", "An autotroph", ["autotroph","an autotroph","producer"], "hard",
  "Plants are the familiar kind; everything else eats them or eats those.");
Q("Science & Nature", "Which type of blood cell defends the body against infection?", "White blood cells", ["white blood cell","white blood cells","leukocyte","leukocytes"], "easy",
  "Far outnumbered by the red ones that carry oxygen.");
Q("Science & Nature", "How many chambers does a fish heart have?", "Two", ["two","2"], "hard",
  "Fewer than yours, because the blood makes a single circuit.");
/* ---- Validation and merge ------------------------------------------------ */

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ").trim();

function containsPhrase(hay, needle) {
  const h = norm(hay), n = norm(needle);
  if (!n) return false;
  if (n.length <= 2) return h === n;
  return new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(h);
}

const problems = [];
const seenQuestions = new Set(bank.questions.map((q) => norm(q.question)));
const byQuestion = new Map(bank.questions.map((q) => [norm(q.question), q]));
let maxId = Math.max(...bank.questions.map((q) => q.id));

let added = 0, updated = 0;

for (const d of draft) {
  const key = norm(d.question);

  if (!["easy", "medium", "hard"].includes(d.difficulty)) {
    problems.push(`"${d.question.slice(0, 50)}" bad difficulty: ${d.difficulty}`);
    continue;
  }
  if (!d.hint || d.hint.trim().length < 12) {
    problems.push(`"${d.question.slice(0, 50)}" hint too short`);
    continue;
  }
  if (containsPhrase(d.hint, d.answer)) {
    problems.push(`"${d.question.slice(0, 50)}" hint contains the answer "${d.answer}"`);
    continue;
  }
  let leaked = false;
  for (const alias of d.accept || []) {
    if (containsPhrase(d.hint, alias)) {
      problems.push(`"${d.question.slice(0, 50)}" hint contains alias "${alias}"`);
      leaked = true;
      break;
    }
  }
  if (leaked) continue;

  const accept = [...new Set((d.accept || []).map((a) => a.toLowerCase()))];

  if (byQuestion.has(key)) {
    Object.assign(byQuestion.get(key), {
      category: d.category, difficulty: d.difficulty,
      answer: d.answer, accept, hint: d.hint.trim(),
    });
    updated++;
  } else {
    bank.questions.push({
      id: ++maxId,
      category: d.category,
      difficulty: d.difficulty,
      question: d.question,
      answer: d.answer,
      accept,
      hint: d.hint.trim(),
    });
    seenQuestions.add(key);
    added++;
  }
}

/* Duplicate question text within the draft itself. */
const draftKeys = draft.map((d) => norm(d.question));
for (const [i, k] of draftKeys.entries()) {
  if (draftKeys.indexOf(k) !== i) problems.push(`duplicate question in draft: "${draft[i].question.slice(0, 50)}"`);
}

if (problems.length) {
  console.error(`FAILED — ${problems.length} problem(s), nothing written:`);
  for (const p of [...new Set(problems)].slice(0, 20)) console.error("  -", p);
  process.exit(1);
}

for (const c of NEW_CATEGORIES) if (!bank.categories.includes(c)) bank.categories.push(c);
bank.meta.count = bank.questions.length;

if (!dry) writeFileSync(bankPath, JSON.stringify(bank, null, 2) + "\n");

console.log(`${dry ? "would add" : "added"} ${added}, updated ${updated}`);
console.log(`bank: ${bank.questions.length} questions, ${bank.categories.length} categories`);
const counts = {};
for (const q of bank.questions) counts[q.category] = (counts[q.category] || 0) + 1;
for (const c of NEW_CATEGORIES) console.log(`  ${String(counts[c] || 0).padStart(4)}  ${c}`);
console.log(`  ${String(counts["Science & Nature"]).padStart(4)}  Science & Nature`);
