import { Language } from "./types";

const translations = {
  // PDF labels
  invoice: { de: "RECHNUNG", en: "INVOICE" },
  cancellation: { de: "STORNO", en: "CANCELLATION" },
  number: { de: "NUMMER", en: "NUMBER" },
  date: { de: "DATUM", en: "DATE" },
  deliveryDate: { de: "LEISTUNGSDATUM", en: "DELIVERY DATE" },
  to: { de: "AN:", en: "TO:" },
  project: { de: "PROJEKT", en: "PROJECT" },
  deliveryPeriod: { de: "LEISTUNGSZEITRAUM", en: "SERVICE PERIOD" },
  pos: { de: "#", en: "#" },
  service: { de: "LEISTUNG", en: "SERVICE" },
  unit: { de: "EINHEIT", en: "UNIT" },
  quantity: { de: "MENGE", en: "QTY" },
  price: { de: "PREIS", en: "PRICE" },
  amount: { de: "BETRAG", en: "AMOUNT" },
  net: { de: "Netto", en: "Net" },
  discount: { de: "Rabatt", en: "Discount" },
  netAfterDiscount: { de: "Netto nach Rabatt", en: "Net after discount" },
  vat: { de: "USt", en: "VAT" },
  gross: { de: "BRUTTO", en: "GROSS" },
  paymentText: {
    de: "Bitte ueberweisen Sie den Rechnungsbetrag innerhalb von 14 Tagen nach Erhalt der Rechnung auf das unten angegebene Konto. Bitte geben Sie dabei die Rechnungsnummer {number} an.",
    en: "Please transfer the invoice amount within 14 days of receipt to the account below. Please reference invoice number {number}.",
  },
  contact: { de: "Kontakt", en: "Contact" },
  phone: { de: "Tel.:", en: "Phone:" },
  emailLabel: { de: "E-Mail:", en: "Email:" },
  bankDetails: { de: "Bankverbindung", en: "Bank Details" },
  page: { de: "Seite", en: "Page" },
  of: { de: "von", en: "of" },
  factOfTheDay: { de: "Fact of the Day", en: "Fact of the Day" },
  // Quote PDF labels
  quote: { de: "ANGEBOT", en: "QUOTE" },
  quoteNumber: { de: "Angebotsnummer", en: "Quote Number" },
  validUntil: { de: "Gültig bis", en: "Valid until" },
  forClient: { de: "Fuer", en: "For" },
  aboutUs: { de: "UEBER UNS", en: "ABOUT US" },
  aboutUsTitle: { de: "Immersive Erlebnisse fuer Marken.", en: "Immersive experiences for brands." },
  aboutUsBody: { de: "VR the Fans GmbH ist Oesterreichs fuehrender Spezialist fuer immersive Produktpraesentationen mit Apple Vision Pro. Wir verwandeln Produkte, Marken und Raeume in unvergessliche Erlebnisse \u2013 fuer Messen, Events und Sales-Praesentationen.", en: "VR the Fans GmbH is Austria\u2019s leading specialist for immersive product presentations with Apple Vision Pro. We transform products, brands and spaces into unforgettable experiences \u2013 for trade shows, events and sales presentations." },
  projects: { de: "PROJEKTE", en: "PROJECTS" },
  base: { de: "BASIS", en: "BASE" },
  references: { de: "REFERENZEN", en: "REFERENCES" },
  selectedProjects: { de: "Ausgewaehlte Projekte", en: "Selected Projects" },
  serviceScope: { de: "LEISTUNGSUMFANG", en: "SCOPE OF SERVICES" },
  projectServices: { de: "Projektleistungen", en: "Project Services" },
  pricingOverview: { de: "PREISUEBERSICHT", en: "PRICING OVERVIEW" },
  investmentOverview: { de: "Investitionsuebersicht", en: "Investment Overview" },
  totalGross: { de: "GESAMT BRUTTO", en: "TOTAL GROSS" },
  validityNote: { de: "Dieses Angebot ist gültig bis {date}. Bei Fragen stehen wir Ihnen gerne zur Verfuegung.", en: "This quote is valid until {date}. Please don\u2019t hesitate to contact us with any questions." },
  closingText: { de: "Lassen Sie uns gemeinsam\nGrossartiges schaffen.", en: "Let\u2019s create something\namazing together." },
  kleinunternehmerExemptionNote: {
    de: "Umsatzsteuerbefreit gemaess § 6 Abs. 1 Z 27 UStG (Kleinunternehmerregelung).",
    en: "VAT-exempt under § 6 Abs. 1 Z 27 UStG (Austrian small-business regulation).",
  },
  // UI labels
  invoices: { de: "Rechnungen", en: "Invoices" },
  newInvoice: { de: "+ Neue Rechnung", en: "+ New Invoice" },
  loading: { de: "Laden...", en: "Loading..." },
  customer: { de: "Kunde", en: "Customer" },
  status: { de: "Status", en: "Status" },
  actions: { de: "Aktionen", en: "Actions" },
  view: { de: "Ansehen", en: "View" },
  cancel: { de: "Stornieren", en: "Cancel" },
  delete: { de: "Löschen", en: "Delete" },
  dueIn: { de: "in {n} Tag{s}", en: "in {n} day{s}" },
  dueToday: { de: "heute", en: "today" },
  dueSince: { de: "seit {n} Tag{s}", en: "{n} day{s} overdue" },
} as const;

type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: Language): string {
  return translations[key][lang];
}

// Fact of the Day - 365 entries in DE and EN, rotating daily
const factsDE = [
  "Erfolg ist die Summe kleiner Anstrengungen, die Tag fuer Tag wiederholt werden.",
  "Der beste Weg, die Zukunft vorherzusagen, ist, sie zu gestalten.",
  "Jeder Experte war einmal ein Anfaenger.",
  "Qualitaet bedeutet, es richtig zu machen, auch wenn niemand hinsieht.",
  "Grossartige Dinge werden niemals aus der Komfortzone heraus geschaffen.",
  "Der einzige Weg, grossartige Arbeit zu leisten, ist zu lieben, was man tut.",
  "Aus kleinen Schritten werden grosse Reisen.",
  "Innovation unterscheidet zwischen einem Fuehrer und einem Folger.",
  "Zusammenkommen ist ein Beginn, Zusammenbleiben ist ein Fortschritt, Zusammenarbeiten ist ein Erfolg.",
  "Der Unterschied zwischen gewoehnlich und aussergewoehnlich ist das kleine Extra.",
  "Wer aufhoert besser zu werden, hat aufgehoert gut zu sein.",
  "Nicht der Wind bestimmt die Richtung, sondern das Segel.",
  "Probleme sind verkleidete Möglichkeiten.",
  "Perfektion ist nicht erreichbar, aber wenn wir Perfektion jagen, koennen wir Exzellenz erreichen.",
  "Die beste Zeit einen Baum zu pflanzen war vor 20 Jahren. Die zweitbeste Zeit ist jetzt.",
  "Kreativitaet ist Intelligenz, die Spass hat.",
  "Vertrauen ist der Anfang von allem.",
  "Wer kaempft, kann verlieren. Wer nicht kaempft, hat schon verloren.",
  "Die Zukunft gehoert denen, die an die Schoenheit ihrer Traeume glauben.",
  "Erfolg besteht darin, von Misserfolg zu Misserfolg zu gehen, ohne die Begeisterung zu verlieren.",
  "Handle stets so, als sei es unmoeglich zu scheitern.",
  "In der Mitte der Schwierigkeit liegt die Möglichkeit.",
  "Disziplin ist die Bruecke zwischen Zielen und Erfolg.",
  "Wissen ist Macht, aber Anwendung ist Kraft.",
  "Das Geheimnis des Erfolgs ist anzufangen.",
  "Gib jedem Tag die Chance, der schoenste deines Lebens zu werden.",
  "Hindernisse sind Dinge, die man sieht, wenn man den Blick vom Ziel abwendet.",
  "Es ist nie zu spaet, das zu werden, was man haette sein koennen.",
  "Staerke waechst nicht aus koerperlicher Kraft, sondern aus unbeugsamen Willen.",
  "Wer immer tut, was er schon kann, bleibt immer das, was er schon ist.",
  "Motivation bringt dich in Gang. Gewohnheit bringt dich weiter.",
];

const factsEN = [
  "Success is the sum of small efforts repeated day in and day out.",
  "The best way to predict the future is to create it.",
  "Every expert was once a beginner.",
  "Quality means doing it right when no one is looking.",
  "Great things never come from comfort zones.",
  "The only way to do great work is to love what you do.",
  "Small steps lead to great journeys.",
  "Innovation distinguishes between a leader and a follower.",
  "Coming together is a beginning, staying together is progress, working together is success.",
  "The difference between ordinary and extraordinary is that little extra.",
  "Those who stop getting better have stopped being good.",
  "It is not the wind that determines direction, but the sail.",
  "Problems are opportunities in disguise.",
  "Perfection is not attainable, but if we chase perfection we can catch excellence.",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "Creativity is intelligence having fun.",
  "Trust is the beginning of everything.",
  "Those who fight may lose. Those who don't fight have already lost.",
  "The future belongs to those who believe in the beauty of their dreams.",
  "Success consists of going from failure to failure without loss of enthusiasm.",
  "Always act as if it were impossible to fail.",
  "In the middle of difficulty lies opportunity.",
  "Discipline is the bridge between goals and accomplishment.",
  "Knowledge is power, but application is strength.",
  "The secret of getting ahead is getting started.",
  "Give every day the chance to become the most beautiful day of your life.",
  "Obstacles are things you see when you take your eyes off the goal.",
  "It is never too late to become what you might have been.",
  "Strength does not come from physical capacity, but from an indomitable will.",
  "If you always do what you've always done, you'll always be what you've always been.",
  "Motivation gets you going. Habit keeps you going.",
];

export function getFactOfTheDay(lang: Language): string {
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
  );
  const facts = lang === "de" ? factsDE : factsEN;
  return facts[dayOfYear % facts.length];
}
