import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { BOOK_URL } from '@/lib/hosts'
import { PRODUCT_MAIL } from '@/lib/hosts'

/**
 * Экскурсия по книге на английском языке.
 *
 * ## Почему экскурсия, а не демонстрационная книга
 *
 * Задумывалась вторая книга — `demo.plem.online`, английская, без России
 * и без породы. Замер остановил: шесть показываемых экранов тянут за собой
 * сто двадцать четыре файла и около двух тысяч русских строк — счёт идёт
 * не по страницам, а по их составным частям, и урезать почти нечего.
 * Снять с карточки животного все вкладки кабинета — формы событий, журнал,
 * заявки — убирает сто шестьдесят две строки из тысячи двухсот.
 * Остальное это словарь предметной области, формулы, сертификация,
 * признаки экстерьера, разбор индекса, то есть сама книга.
 *
 * Недели работы и вечный долг на два языка — ради посетителя, которого
 * пока никто не звал. Поставщики таких систем обычно поступают иначе:
 * показывают устройство, а живой показ ведут голосом, под конкретного
 * собеседника, который уже пришёл.
 *
 * ## Почему изображения нарисованы, а не сняты
 *
 * Настоящий снимок русского экрана иностранцу не читается: он видит
 * рамку и не видит смысла. Здесь взяты настоящие поля, настоящие названия
 * признаков и настоящие числа из кода, но подписаны по-английски.
 *
 * Это названо прямо в тексте страницы. Выдавать рисунок за снимок нельзя:
 * страница целиком про то, что учёту можно верить, и первая же неправда
 * на ней стоит дороже всего остального.
 *
 * ## Почему `lang` стоит на содержимом
 *
 * Корневая раскладка ставит язык по книге, и на витрине это русский.
 * Английская страница внутри русского документа читается вслух русским
 * произношением — то есть неразборчиво. Пометка на своём разделе
 * перекрывает документ, и это правильный способ: страница английская,
 * а сайт нет.
 */

export const metadata: Metadata = {
  title: 'How the herdbook works',
  description:
    'A guided tour of PLEM: animal identity, pedigree, milk recording, conformation, breeding values and data quality checks — built to ICAR guidelines.',
  alternates: { canonical: '/tour' },
}

/* ------------------------------------------------------------------ */

/**
 * Рамка для нарисованного экрана.
 *
 * Намеренно не похожа на окно браузера: у окна есть адресная строка
 * и кнопки, и вместе они говорят «это снимок». Здесь простая рамка
 * с подписью — она говорит «это разбор».
 */
function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="mt-6 overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <figcaption className="border-b border-ink-100 bg-ink-50 px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">
        {title}
      </figcaption>
      <div className="overflow-x-auto p-5">{children}</div>
    </figure>
  )
}

/** Строка «поле — значение», из которых собран весь учёт. */
function Row({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 border-b border-ink-100 py-2 last:border-0">
      <span className="min-w-[13rem] text-[13px] text-ink-500">{k}</span>
      <span className="font-mono text-[14px] text-ink-900">{v}</span>
      {note && <span className="text-[12px] text-ink-400">{note}</span>}
    </div>
  )
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="mt-16 border-t border-ink-100 pt-10">
      <p className="text-[12px] uppercase tracking-[0.1em] text-ink-400">{eyebrow}</p>
      <h2 className="mt-2 max-w-[24ch] text-[26px] font-medium leading-tight sm:text-[30px]">
        {title}
      </h2>
      <div className="mt-4 max-w-[72ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
        {children}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

export default function TourPage() {
  return (
    <div lang="en">
      <ProductHeader />

      <main className="container-page pb-8">
        <p className="text-[13px] uppercase tracking-[0.09em] text-ink-500">Guided tour</p>

        <h1 className="mt-3 max-w-[20ch] text-[38px] font-medium leading-tight sm:text-[48px]">
          A herdbook, not a farm app
        </h1>

        <p className="mt-6 max-w-[70ch] text-[17px] leading-relaxed text-ink-700">
          PLEM keeps the register a breed association is responsible for: who an animal is, who its
          parents are, what it produced, how it was classified, and what its breeding value works
          out to. Farms record events; the association verifies them and stands behind the result.
          The two jobs are different, and this system does the second one.
        </p>

        {/*
           Честность про рисунки — сразу, до первого из них. Сказать это
           внизу мелким шрифтом значило бы дать читателю пройти половину
           страницы в уверенности, что он смотрит снимки.
        */}
        <p className="mt-6 max-w-[70ch] rounded-xl bg-ink-50 px-5 py-4 text-[14px] leading-relaxed text-ink-500">
          The panels below are drawn, not photographed. The fields, trait names and figures are the
          real ones, taken from the running system; the labels are translated, because the interface
          itself is Russian. A live walkthrough of the real screens is a conversation away.
        </p>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Identity" title="One animal, several numbers — and they must agree">
          <p>
            An animal arrives with a national number, usually an ear tag, sometimes an RFID
            transponder, and — if it was imported — a number issued somewhere else entirely. The
            herdbook&rsquo;s first job is to hold all of them at once and to notice when they
            disagree.
          </p>
          <p>
            The international form follows ICAR: country, sex, twelve digits, and the three-letter
            breed code. For an imported animal it is built from its country of origin, never from
            ours — a Dutch cow does not become Russian by being written into a Russian book.
          </p>

          <Screen title="Animal record — identity">
            <Row k="National number" v="1234567890" />
            <Row k="RFID (ISO 11784/11785)" v="643012345678901" note="15 digits" />
            <Row k="International ID" v="NLDM000574590532" note="country · sex · 12 digits" />
            <Row k="With breed code (ICAR)" v="NLDM000574590532HOL" note="19 characters" />
            <Row k="Country of origin" v="NLD" note="ISO 3166-1 alpha-3" />
            <Row k="Sex" v="F" />
            <Row k="Date of birth" v="2021-03-14" />
          </Screen>

          <p className="text-[14px] text-ink-500">
            Thirty-two countries are recognised for identity construction. A transponder number that
            fails the ISO check digit is stored but never exported as valid.
          </p>
        </Section>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Pedigree" title="Assembled from every source, with the source kept">
          <p>
            Ancestry rarely comes from one place. Part of it is on the certificate the farm sent,
            part in a bull catalogue, part in an earlier import. The herdbook assembles the tree
            from all of them and remembers which fact came from where, so a later contradiction can
            be traced instead of argued about.
          </p>

          <Screen title="Pedigree — three generations">
            <div className="min-w-[34rem] font-mono text-[13px] leading-relaxed text-ink-700">
              <div>Cow · NLDM000574590532</div>
              <div className="pl-4">├── Sire · USAM000132745901 · AI bull, proof imported</div>
              <div className="pl-4">│&nbsp;&nbsp;&nbsp;├── SS · USAM000129884411</div>
              <div className="pl-4">│&nbsp;&nbsp;&nbsp;└── SD · USAF000131002877</div>
              <div className="pl-4">└── Dam · RUSF000000451209 · herd record</div>
              <div className="pl-4">&nbsp;&nbsp;&nbsp;&nbsp;├── DS · CANM000012239800</div>
              <div className="pl-4">&nbsp;&nbsp;&nbsp;&nbsp;└── DD · RUSF000000390114</div>
            </div>
          </Screen>
        </Section>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Milk recording" title="Test days, lactations, and what they add up to">
          <p>
            Test-day results are stored as they were measured, and lactation figures are derived
            from them rather than typed in. That ordering matters: a lactation total someone entered
            by hand cannot be re-checked, while one computed from test days can be recomputed the
            day a rule changes.
          </p>

          <Screen title="Animal record — milk recording">
            <div className="min-w-[32rem]">
              <div className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-x-4 border-b border-ink-200 pb-2 text-[12px] uppercase tracking-wide text-ink-400">
                <span>Test day</span>
                <span>Milk, kg</span>
                <span>Fat, %</span>
                <span>Protein, %</span>
              </div>
              {[
                ['2025-04-12', '34.2', '3.82', '3.24'],
                ['2025-05-14', '32.8', '3.75', '3.29'],
                ['2025-06-11', '30.1', '3.91', '3.35'],
              ].map(([d, m, f, p]) => (
                <div
                  key={d}
                  className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-x-4 border-b border-ink-100 py-2 font-mono text-[14px] text-ink-900"
                >
                  <span>{d}</span>
                  <span>{m}</span>
                  <span>{f}</span>
                  <span>{p}</span>
                </div>
              ))}
              <div className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-x-4 pt-3 text-[14px] font-medium">
                <span className="text-ink-500">305 d</span>
                <span className="font-mono">9 640</span>
                <span className="font-mono">3.83</span>
                <span className="font-mono">3.29</span>
              </div>
            </div>
          </Screen>
        </Section>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Conformation" title="Thirty-four linear traits, ten composites">
          <p>
            Classification is recorded trait by trait on the linear scale, and the composite scores
            are computed from them. Who did the classifying is stored with the record — a score
            without a classifier is an opinion, not a measurement.
          </p>

          <Screen title="Animal record — conformation">
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {[
                ['Stature', '7'],
                ['Chest width', '6'],
                ['Body depth', '7'],
                ['Angularity', '8'],
                ['Rump angle', '5'],
                ['Rear legs, side view', '6'],
                ['Foot angle', '7'],
                ['Fore udder attachment', '8'],
                ['Rear udder height', '7'],
                ['Udder depth', '6'],
              ].map(([t, v]) => (
                <div
                  key={t}
                  className="flex items-baseline justify-between border-b border-ink-100 py-1.5"
                >
                  <span className="text-[13px] text-ink-500">{t}</span>
                  <span className="font-mono text-[14px]">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-ink-400">
              10 of 34 linear traits shown. Composites: frame, dairy strength, feet and legs, udder,
              final score.
            </p>
          </Screen>
        </Section>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Breeding value" title="Eleven traits, and a choice of what to weigh them by">
          <p>
            An index is an opinion about what matters, expressed as weights. Rather than hide one
            opinion inside a single number, the system carries several published profiles side by
            side and shows the weights outright, so a breeder can see why two rankings disagree.
          </p>

          <Screen title="Breeding index — profiles">
            <div className="min-w-[30rem] space-y-2">
              {[
                ['NM$ (approximation)', 'US Net Merit — lifetime profit weighting'],
                ['TPI (approximation)', 'US Total Performance Index'],
                ['SIH (approximation)', 'Czech selection index'],
                ['Milk for cheese', 'protein and fat yield forward'],
                ['Keep first-calvers', 'longevity, udder health, fertility'],
                ['Ease the calving barn', 'calving ease and calf survival'],
              ].map(([n, why]) => (
                <div key={n} className="border-b border-ink-100 py-2">
                  <div className="text-[14px] font-medium">{n}</div>
                  <div className="text-[13px] text-ink-500">{why}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-ink-400">
              Traits weighed: milk, fat, protein, productive life, udder health, fertility, calving
              ease, calf survival, body, udder and feet-and-legs composites.
            </p>
          </Screen>
        </Section>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Ranking" title="Four lists, ranked across the whole population">
          <p>
            Bulls, heifers under a year, heifers over a year, cows. Rank is computed over the entire
            category first and the herd filter is applied afterwards — so a farm sees where its
            animal stands in the country, not where it stands among its own.
          </p>

          <Screen title="Association — ranking, bulls">
            <div className="min-w-[30rem]">
              {[
                ['1', 'USAM000132745901', '+1 284'],
                ['2', 'CANM000012239800', '+1 241'],
                ['3', 'NLDM000574590532', '+1 198'],
                ['…', '', ''],
                ['47', 'RUSM000000771044', '+862'],
              ].map(([r, id, v], i) => (
                <div
                  key={i}
                  className="grid grid-cols-[3rem_1fr_6rem] gap-x-4 border-b border-ink-100 py-2 font-mono text-[14px]"
                >
                  <span className="text-ink-400">{r}</span>
                  <span>{id}</span>
                  <span className="text-right">{v}</span>
                </div>
              ))}
            </div>
          </Screen>
        </Section>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Data quality" title="Thirty-two checks that run against the live database">
          <p>
            A herdbook that accepts whatever it is sent launders bad data into official-looking
            records. So the system runs its own checks — on identity, pedigree consistency, event
            ordering, access rights and every export — and publishes what they found.
          </p>
          <p>
            Findings are not hidden while they are being fixed. An association that shows only green
            is either very lucky or not looking.
          </p>

          <Screen title="Checks — last run">
            <div className="min-w-[30rem] space-y-2">
              {[
                ['Progeny agrees with itself', 'ok', 'calving counts vs. registered calves'],
                ['Pedigree has no loops', 'ok', 'an animal cannot be its own ancestor'],
                ['Identity numbers agree', '2 found', 'RFID check digit vs. national number'],
                ['Export matches the template', 'ok', 'every column the registry expects'],
              ].map(([name, state, why]) => (
                <div key={name} className="border-b border-ink-100 py-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[14px]">{name}</span>
                    <span
                      className={`font-mono text-[13px] ${
                        state === 'ok' ? 'text-forest-600' : 'text-accent-600'
                      }`}
                    >
                      {state}
                    </span>
                  </div>
                  <div className="text-[13px] text-ink-500">{why}</div>
                </div>
              ))}
            </div>
          </Screen>
        </Section>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Exchange" title="ICAR ADE, so the data can leave">
          <p>
            Data a farm cannot take with it is data held hostage. The system serves the ICAR Animal
            Data Exchange interface (version 1.5, JSON Schema 2020-12 and OpenAPI 3.1) over seven
            collections, location-centric as the standard prescribes.
          </p>

          <Screen title="ADE — collections served">
            <div className="grid gap-x-8 gap-y-1 font-mono text-[13px] sm:grid-cols-2">
              {[
                'animals',
                'test-day-results',
                'parturitions',
                'inseminations',
                'type-classifications',
                'weights',
                'breeding-values',
              ].map((c) => (
                <div key={c} className="border-b border-ink-100 py-1.5">
                  GET /ade/v1/locations/&#123;scheme&#125;/&#123;id&#125;/{c}
                </div>
              ))}
            </div>
          </Screen>

          <p className="text-[14px] text-ink-500">
            Where a national registry is mandatory, its exports are generated too — twenty templates
            in the Russian case. That obligation belongs to a country, not to breeding: a herdbook
            elsewhere simply does not carry it.
          </p>
        </Section>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Standards" title="What is done, what is partial, what is not started">
          <p>
            The system is mapped against ten ICAR guideline sections and twenty-three compliance
            items, each with its state and the evidence behind it — a check that proves it, a page
            that shows it, or the code that does it. Six items are partial and ten are not started,
            and they are listed as such.
          </p>
          <p>
            Two things are named plainly on those pages: the association is not an ICAR member, and
            ICAR marks are status-based, so no ICAR logo appears anywhere here. Following the
            guidelines and being certified against them are different claims, and only the first one
            is being made.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {[
              { href: '/compliance', label: 'Compliance register' },
              { href: '/icar', label: 'ICAR section map' },
              { href: '/api-docs', label: 'API documentation' },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-full border border-ink-200 px-4 py-2 text-[14px] transition-colors hover:border-ink-400"
              >
                {l.label} <span className="text-ink-400">· in Russian</span>
              </a>
            ))}
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}

        <Section eyebrow="Seeing it live" title="The running herdbook, and how to get a walkthrough">
          <p>
            One association runs on this system today. Its book is open to look at — the interface
            is Russian, but the structure is the one described above, and numbers read the same in
            any language.
          </p>
          <p>
            For a walkthrough in English, or to talk about keeping your own book on it, write to{' '}
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="underline underline-offset-4 hover:text-forest-500"
            >
              {PRODUCT_MAIL}
            </a>
            .
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={BOOK_URL}
              className="rounded-full bg-ink-900 px-5 py-2.5 text-[14px] text-white transition-opacity hover:opacity-90"
            >
              Open the running herdbook
            </a>
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="rounded-full border border-ink-200 px-5 py-2.5 text-[14px] transition-colors hover:border-ink-400"
            >
              Ask for a live walkthrough
            </a>
          </div>
        </Section>
      </main>

      <ProductFooter lang="en" />
    </div>
  )
}
