import type { IcarMapText } from '@/lib/i18n/data/icar-map'

/**
 * Английские слова карты ICAR: названия разделов, «о чём» и «как в книге»,
 * разбор каждого пробела, подписи состояний.
 *
 * Раньше всё это лежало парами полей — `titleEn`, `aboutEn`, `oursEn`,
 * `whatEn`, `whyEn`, `needEn` — прямо в записях `lib/icar-map.ts`.
 * Формулировки перенесены оттуда дословно и не переписывались: они
 * вычитаны, и переписывать вычитанное ради переезда значило бы вычитывать
 * заново. Особого положения у английского здесь нет: он такой же словарь,
 * как остальные четыре, и страница берёт его тем же способом.
 *
 * Названия разделов — имена ICAR со списка руководств, потому у девяти
 * из десяти они совпадают с русской записью слово в слово. Своё имя
 * только у сводной строки про приборы и лаборатории: такого раздела
 * у ICAR нет, и назван он на каждом языке своими словами.
 */
export const ICAR_MAP_EN: IcarMapText = {
  sections: {
    'general-rules': {
      title: 'General Rules',
      about:
        'General rules of recording: who keeps the records, how their trustworthiness is ' +
        'confirmed, what a recording organisation does and what it answers for before the breeder.',
      ours:
        'Roles, access rights and a change log on every record. Verification of records by the ' +
        'Association runs as a separate stream of applications.',
    },
    'milk-recording': {
      title: 'Cattle Milk Recording',
      about:
        'Recording of milk yield: test-day schemes, the intervals between them, computing the ' +
        'lactation, the designation of the performance recording method (A4, B4 and the rest) ' +
        'and the handling of missing tests.',
      ours:
        'Test days with date, yield, fat, protein and somatic cells; the lactation is computed ' +
        'from them rather than entered as a number. The performance recording method is written ' +
        'down through the enumerations of the standard: who took the readings, which milkings ' +
        'were included, how and when the sample was taken — and the familiar A4 or B4 ' +
        'designation is assembled from those rather than stored as a string. Checks catch breaks ' +
        'in the run of test days and lactations without the mandatory figures.',
    },
    dna: {
      title: 'DNA Technology',
      about:
        'Work with genotypes: parentage verification and discovery, the exchange of genotypes ' +
        'between organisations, and the requirements on laboratories.',
      ours:
        'A DNA test with the laboratory, date, method and the result of parentage verification; ' +
        'a disagreement with the recorded parents goes into the checks.',
    },
    conformation: {
      title: 'Conformation Recording',
      about:
        'Conformation recording: linear traits on a nine-point scale, composite scores on a ' +
        'hundred-point scale, and the requirements on the classifier and on the repeatability ' +
        'of scores.',
      ours:
        'Linear scoring on traits 1–9, composite scores 50–100 and the scoring of young stock. ' +
        'Every score carries the classifier and the date. Sixteen linear traits and four ' +
        'composites are mapped to the ICAR nomenclature when exchanging over ADE.',
    },
    repro: {
      title: 'AI and ET Data and Fertility Analysis',
      about:
        'Recording of inseminations and embryo transfers, and the computation of fertility ' +
        'figures: days open, the calving interval, services per conception.',
      ours:
        'Inseminations with the sire, dose, technician and result; days open and the calving ' +
        'interval are computed from the events. Checks catch a calving interval that is too ' +
        'short and an insemination dated before the calving.',
    },
    'functional-traits': {
      title: 'Bovine Functional Traits',
      about:
        'Functional traits: udder health, calving ease, calf survival, longevity — what exactly ' +
        'to record and how to code it.',
      ours:
        'Somatic cells from the test days, calving ease, live and dead calves, and disposal with ' +
        'the date and the reason.',
    },
    'genetic-evaluation': {
      title: 'Dairy Cattle Genetic Evaluation',
      about:
        'Genetic evaluation of dairy cattle: what breeding value is made of, how reliability is ' +
        'computed, how results are published, and the comparison base.',
      ours:
        'A breeding value index with weight profiles, reliability for each trait and for the ' +
        'index as a whole, and the version of the comparison base beside the value. The ranking ' +
        'within the book is published by name.',
    },
    'data-exchange': {
      title: 'Data Exchange',
      about:
        'Data exchange between systems: dictionaries, formats, schemas. The current line is the ' +
        'open ADE standard on JSON and REST, its specification held on GitHub under Apache 2.0.',
      ours:
        'Exchange with FGIAS PR over the twenty templates of the registry — export and reverse ' +
        'import. A REST interface of the book’s own. Seven ADE collections served at the paths ' +
        'of the specification: animals, test days, calvings, inseminations, conformation scores, ' +
        'weights, breeding values, arrivals, departures, deaths, pregnancy checks. POST intake ' +
        'on four of them — test days, calvings, inseminations, weights — with repeat submissions ' +
        'recognised by the pair “source plus its record number”, a line-by-line icarBatchResult ' +
        'response and refusals as icarErrorResource. What is served is validated against the ' +
        'real schemas from the adewg/ICAR repository rather than against our own copy of the ' +
        'enumerations. Selection uses the names of the standard itself: meta-modified-from and ' +
        'meta-modified-to by record date, date-from and date-to by event date, the animal-id and ' +
        'animal-scheme pair by animal; parameters that were not understood are named in the ' +
        'response header rather than dropped silently. Animals, conformation scores, breeding ' +
        'values and movements are deliberately closed to writing: registering an animal and the ' +
        'transfer of rights are statements the Association answers for, and they go through an ' +
        'application with verification rather than as a line in an exchange stream; each is ' +
        'answered with 405 and an explanation.',
    },
    'breed-associations': {
      title: 'Breed Associations',
      about:
        'The work of breed associations and the keeping of herd books: the rules for entering an ' +
        'animal in the book, the sections of the book, and the requirements on descent and on ' +
        'membership.',
      ours:
        'Keeping the book, membership of holdings, issuing breeding certificates, handling ' +
        'applications, verification of records.',
    },
    devices: {
      title: 'Devices and Laboratories',
      about:
        'Certification of identification devices, testing of milk meters and samplers, and the ' +
        'evaluation of milk analysers.',
      ours:
        'This is about hardware and laboratories, not about a recording system. The book accepts ' +
        'the results of such devices but does not certify them and makes no claim to.',
    },
  },

  gaps: {
    'external-audit': {
      what: 'There is no external audit of the procedures.',
      why:
        'A rule checked only by whoever wrote it is a promise, not a rule. The section is ' +
        'built around trustworthiness being confirmed by a third party, and a run of our own ' +
        'cannot take its place.',
      need:
        'The ICAR Certificate of Quality for Herd-book recording and Data processing — the ' +
        'only industry certification of herd book keeping in the world. It is open to ICAR ' +
        'members only, and that runs into matters outside the code (see docs/icar.md).',
    },
    'written-procedures': {
      what: 'The recording procedures are not written down as a document of their own.',
      why:
        'The order of work lives in the code and in the decisions of the developer. While ' +
        'one person runs the system that works; on handover to the Association, or under an ' +
        'external audit, it does not.',
      need:
        'Written rules for keeping the book: who enters, who checks, within what deadlines, ' +
        'what counts as an error and how it is corrected. Work for the Association, not for ' +
        'the system.',
    },
    'test-interval': {
      what: 'The interval between test days is not checked.',
      why:
        'The section sets the permissible intervals, and going beyond them means the ' +
        'lactation has been computed from points too far apart. Our check catches only a ' +
        'complete break in the run, not a stretched interval.',
      need:
        'A rule in the check registry: the interval between neighbouring test days, in days.',
    },
    'genotype-storage': {
      what: 'The result of the test is stored, not the genotype itself.',
      why:
        'We know that parentage is confirmed, but we can neither re-check it ourselves nor ' +
        'hand the genotype to another organisation. On a change of laboratory the ' +
        'confirmation would have to be bought again.',
      need:
        'Genotype storage: the 12 mandatory STR markers and at least 200 SNP from the ISAG ' +
        'panel, TOP/AB format, computation of exclusion probabilities. The ADE standard is ' +
        'no help here — it has no genotypes at all.',
    },
    'genotype-exchange': {
      what: 'There is no exchange of genotypes with other organisations.',
      why:
        'International exchange goes through GenoEx-PSE, and it is closed: ICAR membership ' +
        'plus certification as a DNA Data Interpretation Centre are required. No Russian ' +
        'organisation is among the twenty-seven centres.',
      need:
        'Genotype storage of our own first; exchange becomes possible only once the external ' +
        'situation changes.',
    },
    'trait-nomenclature': {
      what: 'Two composite traits do not fit the ICAR nomenclature.',
      why:
        '“Body volume” and “rear third of the body” are composites of our own, and the ' +
        'icarConformationTraitType enumeration has no counterpart for them. In an exchange ' +
        'they simply do not travel. Passing them off as the nearest traits by meaning would ' +
        'be sending another system a figure under someone else’s name.',
      need:
        'Either a decision by the Association to move to the ICAR set of traits, or the ' +
        'recognition that these two remain internal. The decision is a breeding one, not a ' +
        'technical one.',
    },
    'classifier-repeatability': {
      what: 'The repeatability of scores between classifiers is not measured.',
      why:
        'The section requires that different classifiers give one animal close scores and ' +
        'that this is measured. Without such a check the conformation rating reflects the ' +
        'habits of a particular classifier as much as it reflects the cow.',
      need:
        'Repeat scoring of the same animal by different classifiers and computation of the ' +
        'divergence. That data has to be collected on purpose — ordinary work does not ' +
        'produce it.',
    },
    'embryo-transfer': {
      what: 'Embryo transfer is not recorded.',
      why:
        'The section covers ET as well, and we have neither a flushing, nor a donor and a ' +
        'recipient, nor documentation for an embryo. A calf from a transfer is recorded as ' +
        'an ordinary one, and its pedigree comes out wrong: the recipient dam enters it ' +
        'instead of the genetic dam.',
      need:
        'A flushing event, an embryo record and a “recipient” relation type in the pedigree. ' +
        'ADE has everything for this: icarReproEmbryoFlushingEventResource, ' +
        'icarReproEmbryoResource and the value Recipient in icarAnimalRelationType. ' +
        'Required by the WHFF rules on registration.',
    },
    'health-key': {
      what: 'The ICAR Central Health Key is not used.',
      why:
        'Disease records are kept more freely than the reference list requires, and the ' +
        'frequency of mastitis here cannot be compared with another country: there it is a ' +
        'code, here it is text. The same closes the road to international evaluation of ' +
        'health traits.',
      need:
        'The Central Health Key reference list, a code field on the treatment and the ' +
        'diagnosis, and conversion of the existing records. ADE uses the same key in ' +
        'icarDiagnosisEventResource.',
    },
    'calving-ease-scale': {
      what: 'Calving ease in three degrees instead of five.',
      why:
        'We have “easy, with assistance, difficult”, while the international scale has five ' +
        'degrees with a caesarean of its own. In an exchange our three map onto the other ' +
        'five unambiguously, but not back: two different foreign values arrive as one of ' +
        'ours, and the difference is lost silently.',
      need:
        'Extend the reference list to five degrees per icarReproCalvingEaseType and convert ' +
        'the existing records.',
    },
    'comparison-base': {
      what: 'The comparison base is borrowed rather than our own.',
      why:
        'Standard deviations and heritabilities are taken from the American CDCB-2025 base ' +
        'and converted into metric units. For the Russian population they are approximate: ' +
        'the index is internally consistent, but its absolute value does not mean what it ' +
        'means in a country with a base of its own.',
      need:
        'Computation of genetic parameters on the Russian population — work for a research ' +
        'institute, not for the system. Our part is the base version beside every value, so ' +
        'that a change stays traceable; that is already done.',
    },
    'trend-validation': {
      what: 'There is no validation of the genetic trend.',
      why:
        'The section requires checking that the evaluation does not drift from year to year: ' +
        'Interbull methods I–III are about exactly that. Without such a check a slow shift ' +
        'of the base looks like genetic progress, and the substitution cannot be noticed.',
      need:
        'Implementation of the trend validation tests, methods I–III. It is done without any ' +
        'membership and remains the right architecture even if participation in Interbull ' +
        'never happens.',
    },
    'international-comparison': {
      what: 'The evaluation takes no part in international comparison.',
      why:
        'Interbull MACE brings the evaluations of different countries onto a common scale. ' +
        'Without it our index is comparable with no one’s in either direction — neither to ' +
        'compare a sire nor to judge an imported cow.',
      need:
        'Requires ICAR membership and a validated national evaluation in the common base. ' +
        'Closed today.',
    },
    'ade-resources': {
      what: 'The exchange carries eleven resources of the standard, and there are some fifty.',
      why:
        'Both ways of exchanging work in full, but they carry what the book keeps: animals, ' +
        'test days, calvings, inseminations, conformation, weights, breeding values, ' +
        'movement and pregnancy. Health and treatment, feeding, group events, slaughter, ' +
        'device readings are resources of the standard that we do not have in the book ' +
        'itself, and the exchange has nothing to do with it: there is nothing to carry.',
      need:
        'Keeping the corresponding sections in the book. The exchange will pick them up ' +
        'without a change to the protocol: the collection path and the data set are added in ' +
        'one line — which is exactly why the standard was made independent of the resource ' +
        'type.',
    },
    'book-sections': {
      what: 'The herd book has no sections.',
      why:
        'In international practice the book is divided by degree of purity of breeding (a ' +
        'main part and appendices), and what an animal can be granted and the price it sells ' +
        'at depend on the section. Our book is single and flat.',
      need:
        'A decision by the Association on the structure of the sections, then a section field ' +
        'on the animal and the rules for entering it. The first matters more than the second ' +
        'and is not our work.',
    },
    'pedigree-generations': {
      what: 'The pedigree does not guarantee five generations.',
      why:
        'The WHFF Registration Guidelines require five generations with performance data and ' +
        'a flag for a non-Holstein ancestor among them. We collect as much as the data ' +
        'holds and do not mark where the pedigree breaks off or where another breed enters ' +
        'it.',
      need:
        'A pedigree completeness attribute on the animal, a flag for a foreign breed within ' +
        'five generations, and codes for the Mulefoot, BLAD, CVM and DUMPS recessives.',
    },
  },

  states: {
    full: 'Covered',
    partial: 'Partial',
    out: 'Out of scope',
  },
}
