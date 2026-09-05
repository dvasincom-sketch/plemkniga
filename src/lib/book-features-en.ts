import type { BookFeature } from '@/lib/book-features'

/**
 * Разделы книги по-английски.
 *
 * ## Почему отдельным файлом, а не полем в каждом разделе
 *
 * Русский текст — источник, английский — перевод, и держать их в одной
 * записи значит перемешать источник с производным. При правке русского
 * абзаца перевод рядом выглядит правленым тоже, хотя он остался прежним;
 * в отдельном файле это видно по датам правок.
 *
 * ## Почему не машинный перевод
 *
 * Ровно по тем доводам, что в `docs/lokalizatsiya.md`: зоотехническая
 * терминология переводится не словарём, а по тому, как это называют
 * в отраслевых документах. «Контрольное доение» — test-day milk recording,
 * а не control milking; «племенное свидетельство» — zootechnical
 * certificate по регламенту ЕС, а не breeding certificate; «сводная
 * оценка» экстерьера — composite. Слово, выбранное неверно, специалист
 * опознаёт с первой строки, и дальше он не верит остальному.
 *
 * ## Что здесь сознательно не переведено дословно
 *
 * Названия российских систем: ФГИАС ПР остаётся FGIAS (the Russian state
 * livestock register) с пояснением, а не превращается в «Federal State
 * Information System», которое ничего не сообщает читателю и не ищется
 * в сети. Тот же приём, что у пород: имя как есть, смысл рядом.
 */
export const BOOK_FEATURES_EN: Record<string, BookFeature> = {
  animal: {
    slug: 'animal',
    title: 'Animal record',
    short:
      'Pedigree, production, events, documents and media on one page, with an edit history for every field.',
    body: [
      'The record gathers everything known about an animal in one place: identifiers in every numbering system, pedigree, lactations, conformation scores, events, documents and photographs. It is not a display case but a workplace: the zootechnical certificate is issued from here, the state register file is assembled from here, and from here the animal enters the ranking.',
      'Every field carries a source and a time: entered by hand, arrived in an upload, came through data exchange. An edit does not silently overwrite the previous value — the change history stays, and a year later it is still visible who corrected the calving date and when.',
      'An animal has several identifiers, and they are not interchangeable: herdbook number, farm management system identifier, state register key, transponder number, international ID. Confusing them is the most common reason a file comes back from the register with an error, so the record keeps them explicitly apart.',
    ],
    limits: [
      'The record shows what has been entered. An empty field means no information, not zero: an unrecorded breed percentage and a breed percentage of 0 are different things, and the system does not conflate them.',
      'Photographs and documents are stored with the animal, but the system does not certify that they are genuine: the association signs the document, not the file.',
    ],
  },

  pedigree: {
    slug: 'pedigree',
    title: 'Pedigree',
    short:
      'Assembled from every source at once, with parentage confirmed by DNA and conflicts flagged rather than resolved.',
    body: [
      'The pedigree is built by walking sire and dam links, and it is limited not by storage but by how far the data reaches. Technically the chain has no ceiling: every animal points at its parents, and the walk continues while parents are known.',
      'The tree in a record shows three rows of ancestors — as many as a herdbook certificate prints and as many as a person can read. Depth is handled by a table instead: nine generations with each ancestor’s blood share and contribution to inbreeding, because a complete ninth-generation tree holds five hundred cells and nobody navigates them. Mating uses a shallower walk: it is computed across the whole herd at once, and deeper the gain in the coefficient is smaller than the cost.',
      'Sources are merged: entered by hand, loaded from the state register, confirmed by a DNA test. A conflict between them is not resolved automatically — it is flagged, because choosing between two candidate sires is a decision for a breeding specialist, not for a program.',
    ],
    limits: [
      'A gap in the middle of the chain ends the walk: an unknown dam makes all of her ancestors unknown, and the relationship coefficient is computed on what exists, with the completeness stated alongside.',
      'Parentage confirmation is stored as a test result, not as the genotype itself: it cannot be re-checked by us, and changing laboratory means testing again.',
    ],
  },

  milk: {
    slug: 'milk',
    title: 'Lactations and test-day records',
    /*
     * Английский повторял то же опережающее обещание, что и русский:
     * будто лактация за 305 дней вычисляется из контрольных доений.
     * Она хранится числом, а расчёта из ряда в коде нет. Разбор —
     * в русской ветке, `lib/book-features.ts`.
     */
    short: 'Yield, fat, protein and somatic cells; the series behind a lactation is visible.',
    body: [
      'The test day is the primary record: date, 24-hour yield, fat, protein, somatic cell count, laboratory. The lactation figure sits alongside them, and the book keeps the two together for a reason: the series shows how many points the figure rests on and whether it has gaps. An entered figure cannot be checked on its own — what checks it is what lies beneath it.',
      'Gaps and breaks in the series of test days are shown separately: a lactation resting on sparse points differs from a complete one, and whoever reads the figure is entitled to know that.',
      'Every test day carries its recording method, expressed in ICAR enumerations rather than as free text: who took the readings (a recording organisation or the farmer), which milkings were included, how and when the sample was taken. The familiar "A4" is reassembled from these. This is what makes figures comparable: a lactation under official recording and a lactation recorded by the owner are figures of different weight, and a ranking that adds them together misleads both parties.',
    ],
    limits: [
      'The recording method is stored in ICAR enumerations. Records entered before those fields existed have no method, and stamping them "official recording" retrospectively would declare confirmed what nobody confirmed.',
      'The interval between test days is not yet checked: a complete break in the series is caught, a stretched interval is not. A named gap.',
      'The system does not replace the laboratory: fat and protein arrive from analysis, they are not calculated.',
    ],
  },

  conformation: {
    slug: 'conformation',
    title: 'Conformation scoring',
    short: 'Linear traits, composites and the final class — with the classifier and the date.',
    body: [
      'Linear traits are entered; composites and the final class are derived from them. Each record keeps the classifier and the date: a score is a human judgement, and without the name of the judge it means nothing.',
      'Young stock is scored separately from cows: the scales and the traits differ, and putting them in one series would mean comparing things that are not comparable.',
    ],
    limits: [
      'The scales follow the WHFF linear descriptions for Holsteins. For other breeds the scale may differ, and that is configured when the book is set up rather than assumed.',
    ],
  },

  index: {
    slug: 'index',
    title: 'Breeding value index',
    short:
      'Weight profiles, reliability per trait, rank within the whole book and the expected trait shift per generation.',
    body: [
      'An index is a profile of weights over traits, not a single formula. A farm may have its own profile and the association another, and both are computed on the same data. The result is stored together with the version of the comparison base: without it, six months later there is no way to explain where the figure in an issued document came from.',
      'Alongside the index we show the expected shift of traits over a generation: traits are genetically correlated, and selecting on protein moves fertility — something usually discovered three years later. This is a case where warning is cheaper than repairing.',
      'A national index, once it exists, will enter as one more profile over the same traceable data — the book will not have to be rebuilt for it.',
    ],
    limits: [
      'The comparison base is currently borrowed (Net Merit 2025, converted to metric units). Recalculation on our own population is written and waiting for data.',
      'What is computed is the spread of estimates, not the true genetic standard deviation: strictly, that comes from variance components under an animal model, which is the work of an evaluation centre. Our figures cannot be compared with official NM$ or TPI.',
    ],
  },

  mating: {
    slug: 'mating',
    title: 'Mating plans and inbreeding',
    short:
      'Relationship coefficients from the pedigree, sire selection that accounts for close kinship, and a culling list.',
    body: [
      'The inbreeding coefficient is computed from the pedigree by walking common ancestors. For a small population this is the central instrument: yield gained without controlling relatedness turns, within two generations, into lost fertility and vitality.',
      'Sire selection shows not only the expected gain but the relatedness of the pair: the bull with the best index may be a grandson of the same line, and then the gain in the figure becomes a loss in the herd.',
    ],
    limits: [
      'The calculation runs on the recorded pedigree. An unknown ancestor understates relatedness — the system shows the completeness of the data so that the figure is not read as exact.',
      'There is no genomic relationship: genotypes are not stored in the book, and the coefficient is computed from documents, not from markers.',
    ],
  },

  reports: {
    slug: 'reports',
    title: 'Herd reports',
    short:
      'Herd structure, reproduction, age at first calving, milk quality — with the list of animals behind every figure.',
    body: [
      'Behind every figure in a report stands the list of animals that produced it. A figure without its list cannot be checked, and an uncheckable figure about your own herd is useless: there is nothing to do with it.',
      'Reports are computed on live data when opened, not assembled by a nightly job: what is shown describes the book as it stands today.',
    ],
    limits: [
      'Thresholds in the reports are tied to the Holstein population. For another breed they have to be configured — that is work done when the book is set up.',
    ],
  },

  quality: {
    slug: 'quality',
    title: 'Data quality',
    short:
      'More than fifty rules look for contradictions and show them before the record leaves for the register or a document.',
    body: [
      'The rules check meaning rather than form: a sire younger than its offspring, an insemination earlier than the calving, offspring that do not agree with the birth type, a breed percentage outside the possible range. Errors of this kind are not caught by making a field mandatory — they arise between fields.',
      'Findings are shown where they can be corrected, and before submission. A rejection from the state register arrives a week later and does not say which row is at fault; our check names the animal and the field.',
    ],
    limits: [
      'A rule can be wrong in a rare case — an animal really can be unusual. So a finding does not block the work; it asks for a human decision and stays visible.',
    ],
  },

  documents: {
    slug: 'documents',
    title: 'Documents',
    short:
      'Zootechnical certificates and herdbook papers with a verifiable code; once issued, a document cannot be changed retrospectively.',
    body: [
      'The book issues two forms. The zootechnical certificate follows Regulation (EU) 2016/1012 — the same one under which purebred animals are traded in Europe: fifteen sections and two rows of ancestors, with the order and composition of fields set by the regulation rather than by us. The herdbook certificate is for breeding work: three rows of ancestors with breeding values and lactations.',
      'A document is assembled from the book at the moment of issue and stored together with the code by which it can be verified. What has been issued cannot be altered: editing the data afterwards creates a new document, and the previous one remains, marked as withdrawn.',
      'Before issue the form checks itself: the system will not release a document if a mandatory field is missing, the required rows of the pedigree are incomplete, or a DNA test has excluded the parentage. A complete series of test-day records is required earlier, at verification, without which no certificate is issued at all. This is the essential difference from a form typed in a word processor — there the error is noticed by the buyer.',
      'The document has no legal force, and we do not conceal that: force is conferred by a recognised organisation, not by software. Nor does a recognised third party currently exist for Russian breeding organisations — membership of the European Holstein and Red Holstein Confederation has been suspended since July 2022, and that is the position of the industry, not our omission.',
      'Since external endorsement is unavailable, the weight of the document comes from what the buyer can verify without asking anyone for permission: the form is international and published, the checks run before issue and identically for everyone, what has been issued does not change, and the code allows authenticity to be confirmed in a minute. Trust built this way rests on traceability rather than on a stamp — and that is the one part nobody else can revoke.',
      'What our arrangement lacks by international rules is listed on the compliance page: external audit of procedures (the ICAR Certificate of Quality), storage of genotypes, participation in the international MACE evaluation. We name these ourselves, because a list of nothing but ticks is exactly what the first specialist checks — and he checks it on the items that are missing.',
    ],
    limits: [
      'Legal force is conferred by the organisation keeping the book, not by the system: we are answerable for the content matching the book at the moment of issue and for the pre-issue checks having been run.',
      'A zootechnical certificate on the Regulation (EU) 2016/1012 form is not the same as recognition in the European Union: recognition attaches to the status of the organisation, not to the form.',
    ],
  },

  exchange: {
    slug: 'exchange',
    title: 'Exports and data exchange',
    short:
      'Twenty state register templates with the return file loaded back, ICAR ADE, and a REST interface.',
    body: [
      'The Russian state register (FGIAS) accepts files on its own forms — all twenty templates are assembled from the book, and the return file with the assigned identifiers is loaded back, so that register numbers end up in the animal record rather than in somebody’s mailbox.',
      'International exchange runs on the ICAR ADE standard: eleven collections and two modes — selection by holding and a change feed with a continuation token. The book’s response is validated against the standard’s own schemas on every run.',
      'For custom integrations there is a REST interface with a description generated from the same configuration the interface itself runs on.',
    ],
    limits: [
      'Exchange carries what the book keeps: animals, test days, calvings, inseminations, conformation, weights, breeding values, movements and pregnancy. Health, feeding and group events are not in the book yet.',
      'Registering an animal and transferring ownership through exchange are deliberately closed: these are statements the association is answerable for, and they go through a submission with verification.',
    ],
  },

  access: {
    slug: 'access',
    title: 'Access and roles',
    short:
      'A farm sees its own; the association sees the whole book; a buyer can be granted access to one specific animal.',
    body: [
      'Rights are separated by role and by holding: a farm employee sees their own herd, the association sees the whole book, and an outsider sees only what the farm has made public.',
      'Point access works differently: a buyer can be given one animal for a limited time without opening the herd. Every such grant is visible in the log — to the owner and to the association alike.',
    ],
    limits: [
      'Making an animal public is the farm’s decision. The system publishes nothing at its own discretion and opens nothing "by default".',
    ],
  },

  submissions: {
    slug: 'submissions',
    title: 'Submissions and verification',
    short:
      'Uploaded packages are parsed, checked and signed by the association; every record carries a level of confidence.',
    body: [
      'An upload is not "dump the file": the package is parsed, checked against the rules, and the person is shown exactly what will enter the book and what raises doubt. It can be accepted in part.',
      'The confidence level of a record is derived from confirmations rather than assigned: a laboratory report raises it, a withdrawal lowers it. The association’s signature is a separate action, with a name and a date.',
    ],
    limits: [
      'Verification is work done by people at the association, and its speed depends on them. The system shows the state of a submission; it does not replace the decision and promises no deadline.',
    ],
  },
}
