import type { CheckGroupTexts, CheckTexts } from '@/lib/checks-registry'

/**
 * Английские слова правил проверки.
 *
 * Словарь языка к реестру `checks-registry.ts`: подпись правила, что оно
 * сверяет, зачем и числовая граница, если она у правила есть. Разбор того,
 * почему переводы данных живут отдельными файлами, а не парами полей рядом
 * с записью, — в `i18n/data-text.ts`.
 *
 * Английский до этой правки лежал в самом реестре полями `labelEn`,
 * `whatEn`, `whyEn`, `thresholdEn` и потому был для страницы особым
 * языком: она выбирала его тернарным `english ? … : …`, а на казахском
 * этот признак ложен, и тело страницы оставалось русским. Здесь английский
 * такой же словарь, как остальные четыре, и страница не знает, который
 * из шести показывает. Формулировки перенесены дословно: они вычитаны,
 * и переписывать их при переезде было бы отдельной работой с отдельным
 * риском.
 */

export const CHECKS_EN: CheckTexts = {
  'no-birth-date': {
    label: 'No date of birth',
    what: 'The record has no date of birth.',
    why: 'Without it there is no age, no age at first calving and no herdbook certificate.',
  },
  'birth-in-future': {
    label: 'Date of birth in the future',
    what: 'The date of birth is later than today.',
    why: 'Usually the day and the month have been swapped, or the year is wrong.',
  },
  'no-breed': {
    label: 'Breed not stated',
    what: 'No breed is selected on the record.',
    why: 'The breed determines the comparison base the index is computed against.',
  },
  'blood-out-of-range': {
    label: 'Breed percentage out of range',
    what: 'The breed percentage is below zero or above one hundred per cent.',
    why: 'A share of blood is a part of a whole and cannot go beyond one hundred per cent.',
    threshold: '0…100%',
  },
  'duplicate-ear-tag': {
    label: 'Ear tag repeated',
    what: 'One tag number stands on several animals in the batch.',
    why: 'Tags are replaced and moved between animals, so a tag is not treated as unique. But two live animals under one tag on one farm are almost always a typing error.',
  },
  'pedigree-cycle': {
    label: 'Animal appears among its own ancestors',
    what: 'Walking up the pedigree leads back to this same animal.',
    why: 'Traversal of the pedigree loops at that point. The inbreeding computation survives it — there is a guard in place — but at the cost that the true coefficient cannot be computed either for this animal or for any of its descendants.',
    threshold: 'search nine generations deep',
  },
  'parent-age-implausible': {
    label: 'Impossible parent age',
    what: 'At the birth of the offspring the parent was younger than 19 months or older than 20 years.',
    why: 'Younger than nineteen months is physically impossible: gestation lasts about 279 days. Older than twenty years is almost always a link to the wrong animal — to a namesake, for instance.',
    threshold: '19 months … 20 years',
  },
  'siblings-too-close': {
    label: 'Dam gave birth twice in a row too quickly',
    what: 'One dam has two offspring less than 270 days apart, and it is not a twin birth.',
    why: 'A cow cannot carry two calves faster than gestation lasts. Either one of the offspring is recorded under the wrong dam, or it is a twin birth entered as two separate calvings.',
    threshold: 'less than 270 days between offspring',
  },
  'father-disposed-before': {
    label: 'Sire left the herd long before conception',
    what: 'The sire was disposed of before the offspring could have been conceived: more than a gestation period lies between the disposal and the birth.',
    why: 'Not an error in itself: frozen semen keeps for decades, and this is an ordinary case. But if the farm stores no semen, the link points to the wrong bull.',
  },
  'self-parent': {
    label: 'Animal recorded as its own parent',
    what: 'The sire or dam field holds this same animal.',
    why: 'Traversal of the pedigree loops on such a record, and the inbreeding coefficient cannot be computed.',
  },
  'parent-wrong-sex': {
    label: 'Parent of the wrong sex',
    what: 'A female is recorded as the sire, or a male as the dam.',
    why: 'Most often the sire and dam fields were swapped during entry.',
  },
  'parent-younger': {
    label: 'Parent younger than the offspring',
    what: 'The parent was born after the offspring, or on the same day.',
    why: 'A direct contradiction: usually the link points to the wrong animal — to a namesake, for instance.',
  },
  'no-parents': {
    label: 'Neither parent stated',
    what: 'There are neither links to parents nor their identifiers from the documents.',
    why: 'A record without parentage takes no part in pedigree evaluation and will not carry a herdbook certificate.',
  },
  'pedigree-text-mismatch': {
    label: 'Pedigree on paper disagrees with the link',
    what: 'The parent identifier copied from the certificate differs from the identifier of the animal the link points to.',
    why: 'The pedigree is stored twice: as a link and as text from the document. While the two agree it is a safeguard; once they diverge, one of the two is wrong, and only the farm knows which.',
  },
  'blood-vs-parents': {
    label: 'Breed percentage disagrees with the parents',
    what: 'The breed percentage differs from the mean of the parental values by more than the tolerance.',
    why: 'The breed percentage of the offspring is the mean of the parental ones. A divergence means an error either in the percentage or in the parent itself; the second is far worse, because it spoils every other offspring of that parent as well. This is the only check whose severity depends on the size of the divergence: the marker on the left names the common case, while a large divergence arrives as one to be fixed.',
    threshold: 'over 12.5 percentage points is a warning, over 25 must be fixed',
  },
  'inbreeding-mismatch': {
    label: 'Inbreeding disagrees with the pedigree',
    what: 'The inbreeding coefficient entered on the record differs from the one computed from the pedigree.',
    why: 'A divergence is not always an error: our computation runs on the pedigree held in the book, while the farm may have computed on a fuller one. But it is always a question — on which pedigree.',
    threshold: 'over 1 percentage point',
  },
  'high-inbreeding': {
    label: 'High inbreeding',
    what: 'The inbreeding coefficient exceeds the limit that has been set.',
    why: 'A value like this comes from close mating and calls for parentage confirmed by documents.',
  },
  'afc-too-young': {
    label: 'First calving too early',
    what: 'The age at first calving is under nineteen months.',
    why: 'Gestation lasts about 279 days, so such a calving would have required conception before puberty. This is an error in the date; there is no other explanation.',
    threshold: 'younger than 19 months',
  },
  'afc-too-old': {
    label: 'First calving too late',
    what: 'The age at first calving is over forty-eight months.',
    why: 'Calving at four years is possible, merely expensive. More often it means that the earlier calvings were simply never recorded — and then what is wrong is not the age but the completeness of the data.',
    threshold: 'older than 48 months',
  },
  'duplicate-first-calving': {
    label: 'Two calvings marked as the first',
    what: 'Number 1 stands on several calvings of one cow.',
    why: 'The calving number runs through the whole life of a cow; there is only one first.',
  },
  'calving-order': {
    label: 'Calvings out of order',
    what: 'A calving with a higher number carries an earlier date than the one before it.',
    why: 'Every value on its own is plausible; only their order is impossible. Usually the numbering was mixed up when the data was carried over from the previous recording system.',
  },
  'calving-interval-short': {
    label: 'Calving interval shorter than gestation',
    what: 'The interval between neighbouring calvings is shorter than two hundred and seventy days.',
    why: 'A cow cannot calve twice faster than gestation lasts. Either the date is wrong, or the second entry records an abortion.',
    threshold: 'less than 270 days',
  },
  'calving-number-gap': {
    label: 'Gap in the calving numbers',
    what: 'One or more numbers are missing from the run of calving numbers.',
    why: 'Either a calving was never recorded — and then every lifetime figure is incomplete — or the numbers were entered wrongly.',
  },
  'duplicate-event': {
    label: 'Event recorded twice',
    what: 'One animal has two identical events on one date: two calvings, two inseminations or two test-day recordings.',
    why: 'Usually the same file was uploaded twice. Until the duplicate is removed, every average for the animal is computed on doubled data and the calving numbers run ahead.',
  },
  'insemination-too-soon': {
    label: 'Insemination too soon after calving',
    what: 'Fewer than twenty days between the calving and the insemination.',
    why: 'Before the twentieth day the uterus has not recovered, and there is physically nothing to inseminate. This is not bold management but an error in the date.',
    threshold: 'less than 20 days',
  },
  'pregnancy-check-before-insemination': {
    label: 'Pregnancy check earlier than the insemination',
    what: 'The date of the pregnancy check falls before the date of the insemination itself.',
    why: 'The order of events is reversed: there is nothing to check before the insemination.',
  },
  'bull-born-later': {
    label: 'Bull born after the insemination',
    what: 'The service sire recorded on the insemination was born after its date.',
    why: 'The link points to the wrong animal — as a rule to a namesake, or to a match on a short identifier.',
  },
  'calf-birth-vs-calving': {
    label: 'Calf not born on the day of the calving',
    what: 'The date of birth of the animal recorded as the calf does not match the date of the calving.',
    why: 'A calving and the birth of a calf are one fact recorded twice. A divergence means that either the wrong animal is marked as the calf, or one of the two dates has a typing error.',
  },
  'birth-count-mismatch': {
    label: 'Offspring counts disagree with one another',
    what: 'The birth type, the counts of live heifer calves, bull calves and stillborn, and the calf records themselves state different numbers.',
    why: 'How many were born, the book knows three times over, and the three sources appeared at different times: the birth type was carried over from the previous system, the counts are entered by hand, and records are not created for every calf. A divergence means that one of the three is wrong, and which one is visible from the finding itself.',
    threshold:
      'stillborn calves are not counted among the records: a record is created for a live calf. “Not stated” and “mixed multiple birth” are not cross-checked against anything',
  },
  'milk-test-outside-lactation': {
    label: 'Test-day recording outside the lactation',
    what: 'A test-day recording is dated before the first calving of the cow or after the dry-off date.',
    why: 'There is nothing to milk before the first calving or after dry-off. Usually the wrong animal was picked, or the year in the date slipped.',
  },
  'dna-parentage-excluded': {
    label: 'DNA test excluded the parentage',
    what: 'The test did not confirm the parentage, yet the parents are still on the record.',
    why: 'A direct contradiction between the document and the record — and the only case in which the system knows for certain that the pedigree is wrong.',
  },
  'milk-implausible': {
    label: 'Milk yield outside the plausible limits',
    what: 'Lactation yield below five hundred or above twenty-five thousand kilograms.',
    why: 'Twenty-five thousand occurs in world record holders, forty thousand in no one. Limits drawn this wide catch an error in the unit of measurement without touching a good animal.',
    threshold: '500…25,000 kg',
  },
  'fat-implausible': {
    label: 'Fat outside the plausible limits',
    what: 'Fat content outside the range from two to six and a half per cent.',
    why: 'Beyond these limits it is usually not fat content but swapped columns.',
    threshold: '2.0…6.5%',
  },
  'protein-implausible': {
    label: 'Protein outside the plausible limits',
    what: 'Protein content outside the range from two to five per cent.',
    why: 'The same again: beyond the limits lie swapped columns, not a record.',
    threshold: '2.0…5.0%',
  },
  'bull-own-production': {
    label: 'A bull has production of his own filled in',
    what: 'The record of a bull carries milk yield, fat, protein or lactations, as a cow record would.',
    why: 'A bull has no production of his own: there is nothing to milk. The figure got there from someone else’s spreadsheet or from a wrongly entered sex, and it spoils any herd average the bull enters alongside the cows.',
  },
  'eval-vs-book-divergence': {
    label: 'Imported evaluation diverges from the computation of the book',
    what: 'The rank of the animal by the imported evaluation and by the computation of the book differs by more than forty percentiles.',
    why: 'Evaluations on different bases need not agree, but they must be about the same animal. A divergence of forty percentiles means one of them is about something else: a swapped column, the evaluation of another animal, an index of another breed or of another scale. Percentiles are what gets compared because they are the only common measure: index points from different evaluation centres are incomparable, whereas a rank within one’s own population is not.',
    threshold: 'divergence over 40 percentiles',
  },
  'eval-source-unnamed': {
    label: 'It is not stated who computed the imported evaluation',
    what: 'The record carries an imported evaluation, but neither the evaluation centre nor the base it was computed against is filled in.',
    why: 'An unnamed evaluation cannot be read: a TPI figure from an American catalogue and an index from a regional centre are different quantities, and without the name of the source there is nothing to compare them against. The same field is what makes a divergence from our own computation meaningful: without it, any divergence is explained away as “different bases” and therefore explained by nothing.',
  },
  'eval-fat-kg-mismatch': {
    label: 'Fat kg evaluation disagrees with the yield and percentage evaluations',
    what: 'The breeding value for fat in kilograms differs by more than one standard deviation from what follows from the evaluations for yield and fat percentage.',
    why: 'Kilograms in an evaluation are not an independent figure: they follow from the yield and the percentage. A divergence means the figures were assembled from different sources — and what goes into the index is something the animal does not have. Each figure on its own is plausible, which is why the plausibility limits do not see this error.',
    threshold: 'divergence over 11.3 kg',
  },
  'eval-protein-kg-mismatch': {
    label: 'Protein kg evaluation disagrees with the yield and percentage evaluations',
    what: 'The breeding value for protein in kilograms differs by more than one standard deviation from what follows from the evaluations for yield and protein percentage.',
    why: 'The same as with fat, and more dangerous: protein carries fourteen per cent of the weight in the Association profile, and its spread is three times narrower than that of fat. Forty extra kilograms of protein pull an animal into the top one per cent of the book.',
    threshold: 'divergence over 6.9 kg',
  },
  'fat-kg-mismatch': {
    label: 'Fat in kilograms disagrees with the percentage',
    what: 'Milk fat in kilograms differs from the yield multiplied by the fat percentage by more than a tenth.',
    why: 'A divergence larger than rounding means the figures were taken from different sources, and only the farm knows which of them is right.',
    threshold: 'divergence over 10%',
  },
  'too-old-alive': {
    label: 'Age too high for an animal listed as in the herd',
    what: 'The animal is older than the age limit and is still listed as alive.',
    why: 'Almost always it means that a disposal was never recorded, not that the cow lived to a record age.',
  },
  'disposal-vs-state': {
    label: 'Disposal stated, yet the animal is in the herd',
    what: 'A disposal reason is filled in while the status has stayed as in the herd.',
    why: 'The animal keeps appearing in herd lists and counts, having left the herd everywhere except on paper.',
  },
  'state-vs-disposal': {
    label: 'Disposal without a reason',
    what: 'The status is not in the herd, and no disposal reason is stated.',
    why: 'The reason for disposal is part of breeding records: it is what shows why a herd loses animals.',
  },
  'disposal-date-missing': {
    label: 'Disposal without a disposal date',
    what: 'The status is not in the herd, and no disposal date is entered.',
    why: 'Disposal reports count by the date, not by the status: without it the animal appears in none of them, and the herd disposal rate comes out lower than the real one.',
  },
  'units-mixed': {
    label: 'Milk yields entered in different units',
    what: 'The herd holds records where the yield differs from the rest by two orders of magnitude: some in kilograms, some apparently in tonnes or centners.',
    why: 'One by one such records are caught by the plausibility check, and the farm sees fifty identical warnings instead of one cause. While the units differ, any herd average and any comparison between animals is meaningless.',
    threshold: 'a difference of 100 times or more',
  },
  'milk-test-source-mixed': {
    label: 'Test-day recordings come from different sources',
    what: 'The test-day recordings of the herd come partly from a laboratory, partly from the owner or from an import.',
    why: 'A laboratory measurement and a farm measurement are figures of different accuracy, and they cannot be added into one average. This is not a prohibition: the warning says that part of the data is not independently confirmed, and the herd cannot be judged from it as a whole.',
  },
  'index-base-mixed': {
    label: 'Indexes computed against different comparison bases',
    what: 'Within one profile the evaluations of the animals of the herd refer to different versions of the comparison base.',
    why: 'An index is a deviation from a base. Two animals computed from different bases can neither be compared nor put in one list: part of the difference between them reflects the difference between the bases, not between the animals.',
  },
  'event-year-gap': {
    label: 'A year without a single calving',
    what: 'In the run of years between the first and the last calving of the herd there is a year with none recorded. Looked at only in herds that calve regularly: where calvings are rare, an empty year means nothing.',
    why: 'A herd that calved before and after cannot have stopped calving in between. Almost always it is a report that was never submitted for that year rather than an idle spell: lifetime figures and age at first calving are computed wrongly for those years.',
  },
  'birth-date-clustered': {
    label: 'Dates of birth cluster on one date',
    what: 'A noticeable share of the herd is listed as born on the first of January or on the first day of a month.',
    why: 'This is what a transfer from paper records looks like, where only the year or the month was known: the missing part was filled in with the start of the period. Age at first calving on such records is shifted by months, and the farm looks worse or better than it is.',
    threshold: 'the first of January on more than 5% of the herd',
  },
  'values-rounded': {
    label: 'Milk yields suspiciously round',
    what: 'A noticeable share of the yields in the herd is a multiple of five hundred kilograms.',
    why: 'A measured yield is rarely round. Roundness across the board means an estimate by eye or a transfer from a report where the figures had already been rounded — and such data cannot be used for breeding value evaluation.',
    threshold: 'multiples of 500 kg on more than a quarter',
  },
  'outlier-vs-herd': {
    label: 'Milk yield disagrees with the rest of the herd',
    what: 'The yield of individual animals differs from the median of their own herd by more than threefold in either direction.',
    why: 'The plausibility limits are the same for the whole book and deliberately wide. The herd is a far more precise yardstick: on a farm averaging 7,000 kg a record of 22,000 is formally plausible, while in practice it is almost always an extra zero or someone else’s row.',
    threshold: 'threefold from the herd median',
  },
  'duplicate-calving-number': {
    label: 'Two calvings under one number',
    what: 'An animal has several calvings with the same number — two third calvings, for instance.',
    why: 'The calving number runs through the life of a cow and cannot repeat. A repeat means either a doubled upload or a slipped link: the calving was recorded against the wrong animal. The second is the more dangerous — the event disappears from one cow and appears on another, and the number of calvings, from which the lactation number and the age group are derived, lies for both.',
  },
  'age-group-vs-sex': {
    label: 'Age group disagrees with the sex',
    what: 'A male animal carries a cow age group — first-lactation cow, cow in second lactation or cow in third and later.',
    why: 'One of the two fields is wrong, and from outside it is not visible which. If the sex is wrong, the animal counts as a cow in every report by group and can be given a calving. If the group is wrong, a bull falls into selections of cows and spoils their averages. The system does not choose on behalf of the person: all it knows by itself is that these two values cannot exist together.',
  },
  'production-before-calving': {
    label: 'Production on an animal that has never calved',
    what: 'An animal in the calf or heifer group has milk yield, fat, protein or lactations filled in.',
    why: 'There is no lactation before the first calving — there is nothing to milk. Either the age group is out of date and the animal calved long ago, or the production row arrived from another animal. The first spoils reports by group, the second the evaluation of a bull on his daughters.',
  },
  'no-milk-tests-year': {
    label: 'Cows without a single test-day recording for a year',
    what: 'For part of the live females no measurement has been recorded over the last twelve months. Computed over all live females, heifers included: by the same condition that produces this figure in the task strip of the farm account.',
    why: 'Production in the book is computed from test-day recordings. A cow without measurements takes part neither in the evaluation of a bull on his daughters nor in the herd averages — she is on the list and absent from the computations. The farm sees this same figure in the task strip of its account: there it names the work, here the reason for it.',
    threshold: 'no measurement in 12 months; not computed for herds below the size threshold',
  },
  'ident-core-shared': {
    label: 'Different records under one number',
    what: 'Two or more records of the herd share the numeric part of their identifiers — although those identifiers are held in different fields or in different numbering systems.',
    why: 'Cattle in Russia have no single identifier: one animal goes under a national number, under XXRUS…, under an inventory number and under an ear tag. A match in the digits means one of two things — either it is one cow entered twice, or two different numbers that happen to coincide in digits. Only the farm can tell them apart, and the warning asks the question rather than answering it.',
    threshold: 'a match of at least 8 digits',
  },
}

export const CHECK_GROUPS_EN: CheckGroupTexts = {
  passport: {
    label: 'Passport',
    intro: 'Fields of the record itself: identifier, date of birth, breed, breed percentage.',
  },
  pedigree: {
    label: 'Parentage',
    intro:
      'Parents, the pedigree and everything computed from it. An error here costs more than the rest: it does not spoil one record, it distorts the evaluation of every descendant.',
  },
  reproduction: {
    label: 'Reproduction',
    intro: 'Calvings and inseminations — not one by one, but as a sequence in time.',
  },
  production: {
    label: 'Production',
    intro: 'Milk yield, fat, protein and how well they agree with one another.',
  },
  lifecycle: {
    label: 'Status and disposal',
    intro: 'Whether the status of an animal agrees with what is recorded about it.',
  },
  herd: {
    label: 'Comparability across the herd',
    intro:
      'The only group where a finding belongs not to a record but to the herd as a whole. Every record here is faultless on its own — the trouble is that together they were obtained in different ways and cannot be compared with one another. That is why they are computed over the whole herd rather than over the submission: a share computed from a sample would call itself a share of the herd and would lie. They are visible in “Check my herd” and to the expert reviewing a submission; they do not block submission.',
  },
}
