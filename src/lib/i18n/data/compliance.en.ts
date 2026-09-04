/**
 * Позиции реестра соответствия по-английски.
 *
 * Русский текст позиций стоит в самой записи (`lib/compliance.ts`), рядом
 * с состояниями и доказательствами; каждый другой язык — вот такой словарь,
 * полный по ключам. Английский переехал сюда с парных полей `titleEn`,
 * `oursEn` и прочих дословно: он вычитан, и переписывать его заново под
 * видом переноса значило бы менять смысл.
 *
 * Оставить английский особняком в записи было бы простительно, будь языков
 * два. На шести это сохранило бы странице развилку «английский или русский»,
 * из-за которой казахская страница показывала русское тело: язык, у которого
 * нет своей ветки в коде, молча получает чужой.
 */

import { ADE_COLLECTIONS } from '@/lib/ade/core'
import { ADE_WRITABLE } from '@/lib/ade/parse'
import type {
  ComplianceArea,
  ComplianceKey,
  ComplianceState,
  ComplianceText,
} from '@/lib/compliance'
import type { TextTable } from '@/lib/i18n/data-text'
import { ICAR_GAP_COUNT, ICAR_WITH_GAPS } from '@/lib/icar-map'

export const COMPLIANCE_EN: TextTable<ComplianceKey, ComplianceText> = {
  aiid: {
    title: 'International animal identification number',
    org: 'ICAR / Interbull',
    what:
      'An identifier of the form NLDM000574590532: country per ISO 3166-1, sex, twelve ' +
      'digits of the national number. With the breed code in front, nineteen characters.',
    ours:
      'Assembly and parsing in both country notations, a reference list of thirty-two ' +
      'countries, the country and the number in the country of origin held on the animal. ' +
      'An imported animal counts from its country of origin, not from ours. The number is ' +
      'never invented: no data, no number.',
    next:
      'The breed code field exists in the reference list and is wired into the exchange; ' +
      'whether it is filled in is shown by the check:breed-codes run, and the code is put ' +
      'in by a person who knows the breeds. Separately, a validation rule for “the number ' +
      'does not match its parts” is needed: a discrepancy between the stored number and the ' +
      'one assembled from the parts would go unnoticed today.',
    source: 'ICAR breed codes',
  },

  iso11785: {
    title: 'ISO 11784 / 11785 — radio frequency identification',
    org: 'ISO',
    what:
      'The fifteen-digit decimal representation of the transponder code; the first three ' +
      'digits are the ISO 3166-1 country code or the manufacturer code.',
    ours:
      'A check of the form: length, digits, plausibility of the first three. A manufacturer ' +
      'code of 900 and above is recognised separately and not passed off as a country. ' +
      'A tag leaves for exchange only once it has passed the check.',
    next:
      'The texts of the standards have not been bought — the check is written from ' +
      'secondary sources. Around 100–150 CHF, the only expense in the whole international plan.',
  },

  fgias: {
    title: 'FGIAS, the Russian state livestock register',
    org: 'Ministry of Agriculture of Russia',
    what:
      'From 1 March 2026, submitting information about breeding animals on the forms of the ' +
      'register is mandatory, with the assigned identifiers loaded back.',
    ours:
      'All twenty templates of the register: export and reverse import. The headers are ' +
      'matched line by line against the real files of the register. Every exported field has ' +
      'a way in — by hand or by upload.',
  },

  ade: {
    title: 'ICAR ADE (Animal Data Exchange) 1.5',
    org: 'ICAR',
    what:
      'An open specification for exchanging animal data: JSON schemas, REST, shared ' +
      'vocabularies. Apache 2.0 licence; no formal certification exists.',
    ours:
      `${ADE_COLLECTIONS.length} collections served at the addresses of the specification: ` +
      'animals, test-day milk recordings, calvings, inseminations, conformation scores, ' +
      'weights, breeding values, arrivals, departures, deaths, pregnancy checks. POST is ' +
      `accepted on ${ADE_WRITABLE.length} of them, with a repeated submission recognised by ` +
      'the pair “source + its record id” — otherwise a dropped connection would duplicate ' +
      'the record. Rejections come back as icarErrorResource; a batch answers with ' +
      'icarBatchResult line by line. What is served is validated against the real JSON ' +
      'schemas of the adewg/ICAR repository, not against our own copy of the enumerations. ' +
      'The exchange is documented in the general interface description, in the “Exchange” ' +
      'section.',
    next:
      'Both exchange styles of the standard work: selection by location, and set-based ' +
      'exchange with a change feed, an opaque continuation token and recognition of deleted ' +
      'records. Eleven resources out of some fifty are carried — exactly what the book ' +
      'keeps; health, feeding and group events are not in the book itself yet. Animals, ' +
      'conformation scoring, breeding values and movements are closed for writing ' +
      'deliberately, not by omission: registering an animal and transferring rights are ' +
      'statements the Association answers for before the breeder, and they go through an ' +
      'application with review; each of them is answered with 405 and an explanation in words.',
    source: 'adewg/ICAR on GitHub',
  },

  'own-api': {
    title: 'Our own REST interface',
    org: 'OpenAPI',
    what: 'The interface described by a machine-readable specification, not by prose alone.',
    ours:
      'An OpenAPI description, a documentation page and a run that checks the description ' +
      'against the code. The ICAR ADE exchange is described there as a section of its own: ' +
      'an integrator who opens the documentation learns about the standard interface without ' +
      'studying ours.',
  },

  uncefact: {
    title: 'UN/CEFACT: Animal Traceability and Cattle Registration BRS',
    org: 'United Nations',
    what:
      'Aligning the exchange model with the UN business requirements specifications for ' +
      'livestock traceability.',
    ours: 'Nothing.',
    next:
      'This starts not with the work but with finding the documents themselves: the BRS texts ' +
      'could not be located in the review of open sources.',
  },

  'icar-guidelines': {
    title: 'ICAR Guidelines — twenty-five sections',
    org: 'ICAR',
    what:
      'The rules for recording production, verifying parentage, scoring conformation and ' +
      'computing genetic evaluations that recording organisations on five continents work by.',
    ours:
      'Analysed section by section: what each one requires and how it is done. Not a single ' +
      'section is covered in full, and that is the state of things, not caution in wording.',
    /* Английскому нужна одна развилка вместо трёх русских: `plural` тут не годится. */
    next:
      `${ICAR_GAP_COUNT} ${ICAR_GAP_COUNT === 1 ? 'gap' : 'gaps'} across ` +
      `${ICAR_WITH_GAPS.length} ${ICAR_WITH_GAPS.length === 1 ? 'section' : 'sections'} — ` +
      'all of them written out on a separate page.',
    source: 'wiki.icar.org',
  },

  isag: {
    title: 'ISAG panels and nomenclature',
    org: 'ISAG',
    what:
      'Twelve mandatory microsatellite loci, at least two hundred SNPs from the ISAG set, ' +
      'the TOP/AB notation, computation of exclusion probabilities.',
    ours: 'The twelve mandatory STR loci, the verification methods and the verdicts.',
    next:
      'There is no SNP panel, no TOP/AB notation, and exclusion probabilities are not ' +
      'computed. What is stored is the result of the test, not the genotype: we cannot ' +
      're-check it ourselves, and cannot hand it to another laboratory either.',
  },

  whff: {
    title: 'WHFF Registration Guidelines',
    org: 'World Holstein Friesian Federation',
    what:
      'Registration rules: five generations of pedigree with production data, a flag for a ' +
      'non-Holstein ancestor, the recessive codes Mulefoot, BLAD, CVM and DUMPS, colour ' +
      'codes, embryo documentation.',
    ours: 'None of the above.',
    next:
      'The largest piece of subject-matter work in the plan, and the most useful: this is ' +
      'what makes a herd book different from a database of cows.',
  },

  interbull: {
    title: 'Interbull methodology',
    org: 'Interbull Centre',
    what:
      'The structure of the 200/300/301 files, computation of effective daughter ' +
      'contributions, validation tests of the genetic trend by methods I–III.',
    ours: 'Nothing.',
    next:
      'Trend validation is needed regardless of taking part in international evaluation: ' +
      'without it a slow drift of the base looks like genetic progress, and the substitution ' +
      'cannot be spotted.',
  },

  'interbull-mace': {
    title: 'Taking part in the MACE international evaluation',
    org: 'Interbull Centre',
    what: 'Bringing the national evaluations of different countries onto a common scale.',
    ours:
      'The index of the book is our own computation on a borrowed comparison base, and the ' +
      'caption beside it says so directly.',
    next:
      'Requires ICAR membership and a validated national evaluation in a single countrywide ' +
      'base. The membership form contains a declaration of compliance with OFAC and FATF ' +
      'rules, and ICAR checks it before admission.',
    external: 'ICAR and Interbull: membership and a validated national evaluation',
  },

  'icar-quality': {
    title: 'ICAR Certificate of Quality',
    org: 'ICAR',
    what:
      'The only industry certification of herd book keeping and data processing in the world, ' +
      'with an on-site audit.',
    ours: 'We do not have it, and cannot have it without membership.',
    next:
      'Open to ICAR members only. The analysis is in the document on the mark and membership.',
    external: 'ICAR: certification is open to members only',
  },

  ehrc: {
    title: 'Membership of EHRC and WHFF',
    org: 'European Holstein and Red Holstein Confederation',
    what: 'Mutual recognition of Holstein cattle registration in Europe.',
    ours:
      'The Russian Holstein association was a member of EHRC and was suspended by a decision ' +
      'of 12 July 2022. No public announcement of that suspension being lifted has been found ' +
      'for 2023–2026.',
    next:
      'The first step costs nothing: a letter to the secretary general asking about the ' +
      'current status. Until it is answered, discussing international recognition is pointless.',
    external: 'EHRC and WHFF: the suspension is lifted by a decision of those organisations',
  },

  woah: {
    title: 'Terrestrial Animal Health Code, chapters 4.2 and 4.3',
    org: 'WOAH',
    what:
      'Traceability requirements: preventing duplicate identifiers, the list of events, ' +
      'linking identifiers on import and export, backup copies, confidentiality.',
    ours:
      'Part of the requirements is met in fact — the change log, access rights, events with ' +
      'dates — but no mapping against the text of the code has been made.',
    next:
      'The work is mostly documentary: a table of “requirement → implementation”. There are ' +
      'two items of real work — checks for duplicate identifiers, and the linking of numbers ' +
      'on import.',
  },

  fao19: {
    title: 'FAO Guidelines No. 19 and No. 3',
    org: 'FAO of the United Nations',
    what:
      'Integrated multi-purpose animal recording systems and breeding strategies — as an ' +
      'architectural reference.',
    ours: 'Nothing.',
    next: 'A document, not code. A day of work.',
  },

  dadis: {
    title: 'The Global Plan of Action and DAD-IS',
    org: 'FAO of the United Nations',
    what: 'National reporting on animal genetic resources.',
    ours:
      'Not our area: it is the state that reports, not the developer of the system. Russia ' +
      'does not keep this reporting and does not populate DAD-IS.',
    external: 'the state: reporting to DAD-IS is done by the country, not by the developer',
  },

  wcag: {
    title: 'WCAG 2.2 level AA',
    /* Российский стандарт назван номером и пояснением, а не переводом названия. */
    org: 'W3C / ISO 40500 / GOST R 52872 (the Russian accessibility standard)',
    what:
      'Accessibility of the interface for people with limited sight, hearing and motor control.',
    ours:
      'Particulars: the language is marked up on the pages and on the switcher buttons, the ' +
      'logo and the navigations have labels, links are distinguishable by more than colour. ' +
      'No systematic run against the criteria has been made.',
    next:
      'A run against the criteria, an accessibility statement with an honest list of the ' +
      'limitations — large tables and graphical pedigrees are problematic by nature — and ' +
      'automatic checking of whatever can be automated.',
  },

  iso25010: {
    title: 'ISO/IEC 25010:2023 and 25040',
    org: 'ISO/IEC',
    what:
      'The software quality model as the language of technical specifications and acceptance.',
    ours:
      'The register of runs maps onto the model almost entirely, but the mapping has not been ' +
      'written down. Certification against 25010 essentially does not exist.',
    next: 'A document mapping the eight quality characteristics onto what we have.',
  },

  'open-data': {
    title: 'Open reference data under CC0 1.0',
    org: 'Creative Commons',
    what:
      'Reference lists, codes and exchange schemas under CC0 1.0; aggregated statistics and ' +
      'catalogue metadata under CC BY 4.0. Architecture following the FAIR principles.',
    ours: 'Nothing.',
    next:
      'An open data page with the reference lists in JSON and CSV, a licence file beside each ' +
      'of them, and a licence note in the interface response. It depends on the decision of ' +
      'the Association on what to open.',
    external: 'a decision of the Association on which reference lists to open',
  },

  iso27001: {
    title: 'ISO/IEC 27001 — information security management',
    org: 'ISO/IEC',
    what: 'An information security management system with an external audit.',
    ours: 'Nothing formal.',
    next:
      'Implementation under GOST R ISO/IEC 27001-2021, the Russian adoption of the standard, ' +
      'with an audit by a Russian company. Internationally recognised certification is not ' +
      'available directly: Rosaccreditation, the Russian national accreditation service, is ' +
      'not a signatory to the mutual recognition arrangement for management systems.',
    external:
      'an accredited auditor: certification is issued by a certification body, not by the ' +
      'developer',
  },

  'reestr-po': {
    title: 'The Russian register of domestic software, class 12.03',
    org: 'Ministry of Digital Development of Russia',
    what:
      'Inclusion in the register under the class “software for sector-specific tasks in ' +
      'agriculture”. It opens access to state procurement and exempts the product from VAT.',
    ours: 'No application has been filed.',
    next:
      'Preparation has to start early because of the two-operating-systems rule: for ' +
      'sector-specific application software it applies from 1 June 2027.',
    external:
      'the Ministry of Digital Development: inclusion in the register is a decision of the ' +
      'ministry on the application of the rights holder',
  },

  'gost-rbpo': {
    title: 'GOST R 56939-2024 — the Russian standard for secure software development',
    org: 'Rosstandart / FSTEC of Russia',
    what:
      'Requirements for the development process: code analysis, vulnerability management, ' +
      'testing.',
    ours:
      'Part of the practices is followed in fact; no conformity assessment has been carried out.',
    next:
      'This is the language of FSTEC and of the Ministry of Digital Development, and the ' +
      'foundation of trusted software status.',
    external:
      'a conformity assessment body: the practices can be followed, but conformity can only ' +
      'be confirmed from outside',
  },

  devices: {
    title: 'Certification of devices and laboratories',
    org: 'ICAR',
    what:
      'Testing of milk meters and samplers, certification of identification devices, ' +
      'accreditation of milk and DNA analysis laboratories.',
    ours:
      'Not our area. The book accepts the results of such devices and laboratories, but does ' +
      'not certify them and makes no claim to.',
    external: 'certification bodies for devices and accreditation bodies for laboratories',
  },
}

export const STATE_LABEL_EN: Record<ComplianceState, string> = {
  done: 'Done',
  partial: 'Partial',
  planned: 'Planned',
  blocked: 'Blocked externally',
  out: 'Out of scope',
}

export const STATE_HINT_EN: Record<ComplianceState, string> = {
  done: 'Done, and backed by a run or a page',
  partial: 'The main part is done; what exactly is missing is stated in the entry',
  planned: 'Not started. The work is known, no date is set',
  blocked: 'Not up to us: membership, a sanctions check, a decision of another body',
  out: 'Not our area: hardware, laboratories, tasks of the state',
}

export const AREA_TITLE_EN: Record<ComplianceArea, string> = {
  identification: 'Animal identification',
  exchange: 'Data exchange',
  breeding: 'Herd book keeping and evaluation',
  intergov: 'Intergovernmental codes',
  software: 'Software quality and accessibility',
  russia: 'Mandatory Russian requirements',
}

export const AREA_HINT_EN: Record<ComplianceArea, string> = {
  identification: 'What the animal is called here and how it is found from outside',
  exchange: 'The language the book speaks to other systems in',
  breeding: 'The rules for keeping the book and computing breeding values',
  intergov: 'Requirements of the UN and of intergovernmental organisations',
  software: 'Properties of the program itself, not of the data in it',
  russia: 'What the law requires and what cannot be sold without',
}
