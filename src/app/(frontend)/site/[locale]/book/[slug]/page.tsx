import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { BOOK_FEATURES, featureBySlug } from '@/lib/book-features'
import { pageMetadata } from '@/lib/seo'
import { CertificateArt } from '@/components/site/CertificateArt'
import {
  AccessScreen,
  AnimalStates,
  ConformationScreen,
  ExchangeScreen,
  IndexScreen,
  MatingScreen,
  MilkScreen,
  PedigreeScreen,
  QualityScreen,
  ReportsScreen,
  SubmissionsScreen,
} from '@/components/site/BookScreens'
import { WindowFrame } from '@/components/site/WindowFrame'
import { BOOK_URL, PRODUCT_MAIL } from '@/lib/hosts'

/*
 * Заголовок и описание берутся у самого раздела: у него уже есть имя
 * и короткая строка о том, что он делает. Общий заголовок «Раздел
 * книги» на двенадцати страницах означал, что в выдаче они неотличимы
 * друг от друга — и человек, искавший «подбор пар инбридинг», видел
 * двенадцать одинаковых строк.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const feature = featureBySlug(slug)
  if (!feature) return { title: 'Раздел книги' }

  return pageMetadata({
    title: `${feature.title} — что внутри племенной книги`,
    description: feature.short,
    path: `/${locale}/book/${slug}`,
  })
}

/**
 * Разбор одного раздела книги.
 *
 * ## Почему страница, а не подсказка при наведении
 *
 * Перечень на главной отвечает «что здесь есть». Следующий вопрос —
 * «а что это значит» — требует абзацев, оговорок и пределов. Всплывающая
 * подсказка их не вмещает, а раздутая строка перечня превращает список
 * в стену, которую пролистывают целиком.
 *
 * ## Почему у каждого раздела названы пределы
 *
 * Раздел без пределов читается как реклама, и первый же специалист
 * спрашивает именно про них: сколько поколений, какая точность, что
 * будет, если данных нет. Отвечать до вопроса дешевле, чем после.
 */
export default async function BookFeaturePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale: raw, slug } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const notice = PAGE_MESSAGES[locale].notice
  const feature = featureBySlug(slug)
  if (!feature) notFound()

  const others = BOOK_FEATURES.filter((f) => f.slug !== feature.slug)

  return (
    <>
      <ProductHeader locale={locale} path={`/book/${feature.slug}`} />

      <main className="container-page pb-16">
        <nav className="pt-2 text-[14px] text-ink-500">
          <Link href={`/${locale}`} className="underline underline-offset-4 hover:text-forest-500">
            Что внутри книги
          </Link>
        </nav>

        <section className="mt-6 max-w-[75ch]">
          <h1 className="text-[34px] font-medium leading-tight sm:text-[42px]">{feature.title}</h1>

          <p className="mt-5 text-[17px] leading-relaxed text-ink-700">{feature.short}</p>

          {notice && (
            <p className="mt-5 rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
              {notice}
            </p>
          )}
        </section>

        <section className="mt-10 max-w-[75ch] space-y-5">
          {feature.body.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="text-[16px] leading-relaxed text-ink-700">
              {paragraph}
            </p>
          ))}
        </section>

        {/*
           Документ — единственное, что уходит из книги наружу и попадает
           в руки покупателю. Про него спрашивают первым, и словами
           («выдаём свидетельство») этот вопрос не закрывается: выдают все.
           Показанный бланк отвечает сразу — что в нём есть, по какой форме
           он сделан и чем проверяется.
        */}
        {/*
           Экран раздела там, где у раздела есть визуальный код.

           Долгое время три раздела — отчёты, доступы и заявки — стояли
           без рисунка, и довод был такой: рисовать «что-нибудь» ради
           полноты значит обесценить те рисунки, которые несут смысл.
           Довод верный, но вывод из него был сделан поспешный: у всех
           трёх визуальный код нашёлся, просто он не в том, о чём раздел
           говорит первой строкой.

           У отчётов это не показатели, а раскрытая строка: число,
           под которым лежат те самые животные. У доступов — не роли
           (их уже показывает карточка в трёх прочтениях), а выдача
           на одно животное с записью в журнале. У заявок — не загрузка,
           а разбор пакета на три исхода и кнопка с двумя числами.

           Правило от этого не отменяется, а уточняется: сначала ищется
           утверждение, которого нет в тексте, и только потом рисунок.
           Раздел, у которого такого утверждения не нашлось, остаётся
           без картинки — но искать надо не в заголовке.
        */}
        {feature.slug === 'animal' && (
          <section className="mt-10">
            <AnimalStates />
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Одна карточка, три прочтения. Разница не в оформлении, а в правах: посторонний
              видит то, что хозяйство открыло, владелец — работу, а у быка другой предмет
              разговора. Нарисовано вёрсткой; значения показаны для примера.
            </p>
          </section>
        )}

        {feature.slug === 'pedigree' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <WindowFrame title="Ромашка · RU 4512 087" subtitle="происхождение">
                <PedigreeScreen />
              </WindowFrame>
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Подтверждённое ДНК помечено, неизвестный предок показан пунктиром. Скрывать
              пропуск нельзя: он меняет смысл коэффициента родства.
            </p>
          </section>
        )}

        {feature.slug === 'quality' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <QualityScreen />
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Находка называет животное и поле — иначе её нельзя исправить. Отказ реестра
              приходит через неделю и говорит про файл.
            </p>
          </section>
        )}

        {feature.slug === 'milk' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <MilkScreen />
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Метод контроля записан рядом с рядом замеров, а пропуск в ряду назван
              пропуском. Без метода два одинаковых «9 640 кг» из разных хозяйств
              несравнимы, а выглядят одинаково.
            </p>
          </section>
        )}

        {feature.slug === 'index' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <WindowFrame title="Ромашка · RU 4512 087" subtitle="профиль Ассоциации">
                <IndexScreen />
              </WindowFrame>
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Показано не число, а из чего оно сложилось — включая вклад со знаком минус.
              Индекс без разбора нечем проверить и не с чем спорить.
            </p>
          </section>
        )}

        {feature.slug === 'conformation' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <WindowFrame title="Ромашка · RU 4512 087" subtitle="линейная оценка">
                <ConformationScreen />
              </WindowFrame>
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Линейная шкала описывает, а не хвалит: девятка означает «очень», а не «лучше».
              У роста желаемое ближе к краю, у постановки ног — посередине, и абзацем это
              не объясняется так же быстро, как одной полосой.
            </p>
          </section>
        )}

        {feature.slug === 'mating' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <WindowFrame title="Ромашка · RU 4512 087" subtitle="подбор быка">
                <MatingScreen />
              </WindowFrame>
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Список отсортирован по индексу, а предупреждение стоит у первой строки: лучший
              по числу бык здесь и есть худший выбор. В каталоге поставщика этого не видно
              вовсе — там у быка одно число, — а видно только там, где обе родословные лежат
              рядом и инбридинг считается для потомка, которого ещё нет.
            </p>
          </section>
        )}

        {feature.slug === 'reports' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <WindowFrame title="Стадо ООО «Рассвет» · 231 корова" subtitle="отчёт">
                <ReportsScreen />
              </WindowFrame>
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Строка раскрыта, и под средним возрастом первого отёла стоят те животные,
              из которых оно сложилось, — включая тех, кто среднее и портит. Число без списка
              нечем проверить и нечего с ним делать: ради этих животных отчёт и открывают.
            </p>
          </section>
        )}

        {feature.slug === 'access' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <WindowFrame title="Ромашка · RU 4512 087" subtitle="доступ">
                <AccessScreen />
              </WindowFrame>
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Показан не перечень ролей, а точечная выдача: одно животное, срок, два списка —
              что откроется и что нет. Первый вопрос при разговоре о доступах звучит именно так
              («а надои покупатель увидит?»), и отвечать на него надо обеими половинами сразу.
            </p>
          </section>
        )}

        {feature.slug === 'submissions' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <WindowFrame title="Заявка № 3184 · ООО «Заря»" subtitle="разбор пакета">
                <SubmissionsScreen />
              </WindowFrame>
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Пакет разложен на три исхода, у каждого сомнения названа причина, а на кнопке
              стоят оба числа. «Принять» без чисел означало бы обратное — залить файл как есть
              и разбираться потом.
            </p>
          </section>
        )}

        {feature.slug === 'exchange' && (
          <section className="mt-10">
            <ExchangeScreen />
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Одно и то же доение в двух формах: слева колонки государственного реестра,
              справа ответ по международному стандарту. Запись при этом одна — вводится
              она единожды, а форм у неё столько, сколько адресатов.
            </p>
          </section>
        )}

        {feature.slug === 'documents' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <CertificateArt />
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Разделы, подписи и единицы — из настоящего бланка; значения показаны для примера.
              Рисунок, а не снимок: в выпущенном документе стоят настоящие животные
              и настоящие хозяйства, и на витрине им не место.
            </p>
          </section>
        )}

        {/*
           Пределы — отдельным блоком и другим цветом. Смешанные с общим
           текстом, они читаются как оговорка мелким шрифтом; вынесенные,
           они читаются как то, чем и являются: границей, названной
           до вопроса.
        */}
        <section className="mt-10 max-w-[75ch] rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
          <h2 className="text-[18px] font-medium leading-tight">Пределы</h2>
          <ul className="mt-4 space-y-3">
            {feature.limits.map((l) => (
              <li key={l.slice(0, 40)} className="text-[15px] leading-relaxed text-ink-500">
                {l}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-[20px] font-medium leading-tight">Другие разделы</h2>

          {/*
             Подсвечивается вся плашка, а не черта над ней.

             Раньше наведение окрашивало верхнюю границу — полоску
             в один пиксель, отделявшую строку от предыдущей. Отклик
             появлялся не там, куда смотрит человек: указатель стоит
             на слове, а загорается край, причём край **над** словом,
             то есть визуально ближе к соседней строке сверху. В среднем
             столбце это читалось как подчёркивание чужого пункта.

             Плашка отвечает на другой вопрос: не «где проходит граница»,
             а «что откроется, если нажать».

             Заливка при этом белая всегда, а наведение меняет только цвет
             рамки. Первая редакция делала наоборот — подкрашивала фон
             при наведении, — и плашка вспыхивала ярче всего остального
             на странице. Отклик обязан быть тише содержимого: он
             подтверждает, что попал, а не зовёт нажать. Точно так же
             отвечают карточки разделов на главной, и заводить второй
             способ откликаться было незачем.
          */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((f) => (
              <Link
                key={f.slug}
                href={`/${locale}/book/${f.slug}`}
                className="rounded-xl border border-ink-100 bg-white px-4 py-3 transition-colors hover:border-forest-500"
              >
                <span className="text-[15px] font-medium">{f.title}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12 max-w-[75ch] rounded-2xl bg-forest-500 p-8 text-white sm:p-10">
          <h2 className="text-[22px] font-medium leading-tight sm:text-[26px]">
            Посмотреть, как это работает
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-white/85">
            Голштинская книга открыта: разделы можно открыть и прочитать на живых данных.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a
              href={BOOK_URL}
              className="rounded-xl bg-white px-6 py-3 text-[15px] text-forest-600 transition-colors hover:bg-white/90"
            >
              Открыть племенную книгу
            </a>
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="text-[15px] text-white/80 underline underline-offset-4 transition-colors hover:text-white"
            >
              Написать нам
            </a>
          </div>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
