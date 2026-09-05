import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ANCESTRY_DEPTH } from '@/lib/ancestry'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { NoteHeader, NoteNeighbours, NoteSources } from '@/components/site/NoteFrame'
import { TermsSeen } from '@/components/site/TermsSeen'
import { NOTES, noteBySlug } from '@/lib/notes'
import { pageMetadata } from '@/lib/seo'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import {
  FGIAS_MEASURED_ON,
  FGIAS_MEASURED_ON_DATE,
  FGIAS_TEMPLATES,
  FGIAS_TOTALS,
} from '@/lib/fgias-templates'

const SLUG = 'fgias-i-indeks'

export async function generateMetadata(): Promise<Metadata> {
  const note = noteBySlug(SLUG)!
  return pageMetadata({
    title: note.title,
    description: note.lead,
    path: `/ru/razbory/${SLUG}`,
  })
}

/**
 * Разбор: файлы ФГИАС ПР как фундамент будущего национального индекса.
 *
 * ## Почему эта тема важнее, чем кажется хозяйству
 *
 * Двадцать шаблонов реестра читаются как отчётность: заполнить, сдать,
 * забыть. А это данные, из которых через несколько лет посчитают
 * племенную ценность российских животных, — и качество индекса будет
 * ровно таким, каким его сделают эти файлы. Разговор про «сдать отчёт»
 * и разговор про «наполнить базу, из которой посчитают твоего быка» —
 * это разные разговоры про одно действие, и второй мало кто ведёт.
 *
 * ## Что здесь чужое, а что наше
 *
 * Чужое — сроки, планы и цифры Минсельхоза, всё названо источником
 * и годом. Наше — состояние книги: сколько колонок из скольких мы
 * заполняем сегодня и почему у родословной три из пятнадцати. Числа
 * берутся из `lib/fgias-templates.ts`, то есть из того же места, откуда
 * их берёт страница «Двадцать шаблонов», а не переписаны сюда руками.
 *
 * ## Почему разбор кончается пределами, а не обещаниями
 *
 * Тема располагает к обратному: до национального индекса далеко, обещать
 * можно что угодно, проверить будет некому. Поэтому предел назван прямо:
 * сдача файлов — необходимое условие и не достаточное; расчётным центром
 * мы не являемся и не станем.
 */
export default async function FgiasNotePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()
  const locale: Locale = raw
  const note = noteBySlug(SLUG)!

  const ready = FGIAS_TEMPLATES.filter((t) => t.state === 'ready').length
  const share = Math.round((FGIAS_TOTALS.fill / FGIAS_TOTALS.columns) * 100)
  const measured = new Date(FGIAS_MEASURED_ON_DATE).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  /** Три шаблона, на которых видно устройство дела. */
  const SHOWN = ['Основные сведения', 'Родословная', 'Достоверность происхождения']

  return (
    <>
      <ProductHeader locale={locale} />

      <main className="container-page pb-16">
        <NoteHeader note={note} />

        {/* ------------------------- Что такое ФГИАС ПР ------------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Что происходит с государственным учётом
          </h2>

          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
            Закон о племенном животноводстве переписан: изменения, внесённые федеральным законом
            № 454-ФЗ от 4 августа 2023 года, вводят государственную регистрацию племенных животных
            и племенных стад, и часть из них вступает в силу с 1 марта 2026 года. Регистрация
            и передача сведений идут через федеральную государственную информационно-аналитическую
            систему племенных ресурсов — ФГИАС ПР.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            По словам советника министра сельского хозяйства Ольги Абрамовой, работу над системой
            начали в 2022 году, сейчас её обкатывают в четырёх регионах — Татарстане, Удмуртии,
            Алтайском крае и Архангельской области, — а с 1 марта 2026 года она входит
            в промышленную эксплуатацию и становится обязательной для всех. Сведения собираются
            ежеквартально, а не раз в год по итогам отчёта.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Там же названо и то, о чём в хозяйствах пока не думают: с 1 марта 2026 года в законе
            появляется само определение «племенное животное». Вопрос, кто им считается — тот, кто
            больше доит, дольше живёт или приносит больше потомства, — по словам Абрамовой,
            ключевой на 2026 год. Ответ на него в конечном счёте и есть индекс.
          </p>
        </section>

        {/* --------------------------- Зачем это делается ----------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Куда это ведёт: национальный индекс к 2030 году
          </h2>

          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
            Минсельхоз называет цель прямо: к 2030 году разработать национальный индекс племенной
            ценности для всех видов животных и геномный прогноз. Инструмент уже пробовали
            в Удмуртии. Ожидаемый результат назван числом — продуктивность племенных животных
            до 11 500 кг на корову против сегодняшних 9 500, жир и белок выше на 0,2 %.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Под это подводится и деньги, и данные. Государство компенсирует 70 % стоимости
            геномного теста и прогноза племенной ценности для молодняка до десяти месяцев;
            результаты генотипирования ложатся в ту же базу. В 2025 году речь шла о 80 тысячах
            генотипов по стране при потребности в 200–250 тысячах ежегодно.
          </p>

          <div className="mt-6 rounded-2xl bg-brand-50 px-6 py-5">
            <p className="text-[16px] leading-relaxed text-ink-700">
              База описана как стоящая на трёх китах: родословные, генетически детерминированные
              заболевания и хозяйственно полезные признаки. Все три приезжают туда файлами
              из хозяйств — теми самыми двадцатью шаблонами.
            </p>
          </div>

          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
            Отдельно заводится единый реестр быков-производителей, и причина названа без
            прикрас: за всё время в стране работало более тридцати тысяч быков, и у них,
            по выражению Абрамовой, «очень много двойников» — один и тот же бык живёт в разных
            системах под разными именами. Пока это так, связать дочерей одного отца из разных
            хозяйств нельзя, а без этого не считается ничего.
          </p>
        </section>

        {/* ----------------------- Почему индекс — это данные ------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Индекс — это не формула, а данные
          </h2>

          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
            Формулу национального индекса можно написать за неделю: их публикуют, разбирают
            и обсуждают открыто (см.{' '}
            <Link
              href="/ru/razbory/indeks-i-nm-tpi"
              className="font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
            >
              разбор NM$ и TPI
            </Link>
            ). Невозможно другое — собрать под неё популяцию: связные родословные, повторяемые
            измерения продуктивности с записанным методом контроля, известных быков и известное
            происхождение их дочерей.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Отсюда простое следствие, которое и делает эту тему не бумажной. Файлы, которые
            хозяйство сдаёт в реестр, — не отчётность о прошедшем годе. Это материал, на котором
            через несколько лет посчитают племенную ценность его собственных животных. Плохо
            заполненный файл — не штраф; это отсутствующая строка в оценке, которую сделают
            без тебя.
          </p>
        </section>

        {/* --------------------------- Что умеет книга -------------------------- */}
        <section className="mt-14">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Что книга умеет сегодня
          </h2>

          <p className="mt-5 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">
            Двадцать шаблонов версии 2.6.0 книга собирает целиком. Колонки сосчитаны чтением
            самих файлов, а «заполним» получено прогоном по живой базе: считались поля, которые
            в книге заведены <strong className="font-medium">и заполняются</strong>. Считать
            по схеме было бы лестнее и бесполезнее — поле, которое никто не вносит, даёт
            в выгрузке пустую ячейку и отказ реестра.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { value: `${FGIAS_TOTALS.templates}`, label: 'шаблонов собирается кнопкой' },
              { value: `${ready} из ${FGIAS_TOTALS.templates}`, label: 'заполняются целиком' },
              {
                value: `${FGIAS_TOTALS.fill} из ${FGIAS_TOTALS.columns}`,
                label: `колонок заполняем — ${share} %`,
              },
              {
                value: FGIAS_TOTALS.rowsReady.toLocaleString('ru-RU'),
                label: 'строк уехало бы без единой правки',
              },
            ].map((n) => (
              <div key={n.label} className="rounded-2xl border border-ink-100 bg-white p-5">
                <div className="stat-value text-[22px] leading-none text-forest-600 sm:text-[26px]">
                  {n.value}
                </div>
                <p className="mt-3 text-[13px] leading-snug text-ink-500">{n.label}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
            Числа получены прогоном {measured} на живых данных ({FGIAS_MEASURED_ON}). Они
            не пересчитываются при открытии страницы: расчёт на каждое открытие означал бы обход
            всей книги ради витрины, а главное — менялся бы от хозяйства к хозяйству, тогда как
            отвечать надо про платформу. Дата поэтому стоит рядом с числами, а не в примечании.
          </p>

          <div className="mt-8 overflow-x-auto">
            <table className="data-table w-full min-w-[640px] text-[14px]">
              <thead>
                <tr>
                  <th className="text-left">Шаблон</th>
                  <th className="w-[130px] text-right">Колонок</th>
                  <th className="w-[150px] text-right">Заполняем</th>
                  <th className="w-[150px] text-left">Состояние</th>
                </tr>
              </thead>
              <tbody>
                {FGIAS_TEMPLATES.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td className="text-right tabular-nums text-ink-500">{t.columns}</td>
                    <td className="text-right tabular-nums">{t.fill}</td>
                    <td className={t.state === 'ready' ? 'text-forest-600' : 'text-amber-800'}>
                      {t.state === 'ready' ? 'целиком' : 'частично'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* --------------------------- Где узкое место -------------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Где узкое место, и оно не там, где ждут
          </h2>

          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
            Самый показательный шаблон — родословная: три колонки из пятнадцати. Не потому,
            что книга не знает предков: она их знает и разбирает на {ANCESTRY_DEPTH} колен.
            Все пятнадцать колонок этого шаблона — номера государственного реестра, а поля
            «Идентификатор учётной системы» в нём нет вовсе. Назвать предка своим ключом нельзя,
            а реестровый номер у него появится только после того, как реестр примет его самого.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Отсюда порядок, который стоит понимать до первой сдачи. Всё начинается с шаблона
            «Основные сведения» — единственного, где животное названо нашим ключом. Хозяйство
            сдаёт его, получает обратный файл с присвоенными базовыми номерами, и книга кладёт
            эти номера в карточки. Только после этого становятся заполнимыми родословная
            и всё остальное, где животное называют номером реестра.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            То есть узкое место не в наших полях, а в очерёдности: сначала популяция получает
            номера, потом между этими номерами протягиваются связи. Национальный индекс стоит
            на втором шаге, и торопить его, не сделав первый, бессмысленно.
          </p>

          <div className="mt-6 space-y-4">
            {FGIAS_TEMPLATES.filter((t) => SHOWN.includes(t.name)).map((t) => (
              <div key={t.name} className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-[16px] font-medium">{t.name}</span>
                  <span className="text-[14px] tabular-nums text-ink-500">
                    {t.fill} из {t.columns}
                  </span>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-500">{t.gap}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------- Что делает книга сверх --------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Что книга делает сверх самой выгрузки
          </h2>

          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
            Собрать файл — половина дела, и не самая трудная. Вторая половина в том, чтобы он
            не вернулся. Отказ реестра приходит примерно через неделю и говорит про файл,
            а не про строку; наши правила проверяют записи до отправки и называют животное
            и поле —{' '}
            <Link
              href={`/${locale}/rules`}
              className="font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
            >
              список правил открыт
            </Link>
            , как программа экзамена, а не замечание после него.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            Обратный файл загружается назад, и присвоенные номера оказываются в карточках,
            а не в почте у зоотехника. Это скучная работа, о которой не говорят на конференциях,
            и ровно она решает, будет ли через год чем связывать родословные.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
            И то же самое отдаётся международным обменом — по стандарту ICAR ADE, теми же
            записями в другой форме. Запись одна, вводится единожды, а форм у неё столько,
            сколько адресатов; это{' '}
            <Link
              href={`/${locale}/ade`}
              className="font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
            >
              разобрано отдельно
            </Link>
            .
          </p>
        </section>

        {/* ------------------------------ Пределы ------------------------------- */}
        <section className="mt-14 max-w-[75ch] rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
          <h2 className="text-[20px] font-medium leading-tight">Пределы, названные до вопроса</h2>

          <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-500">
            <p>
              <strong className="font-medium text-ink-700">Мы не расчётный центр.</strong>{' '}
              Национальный индекс считает не тот, кто ведёт книгу, а тот, у кого вся популяция
              страны и модель животного. Наша работа — чтобы данные, на которых его посчитают,
              были полными и прослеживаемыми. Свой индекс книга считает на заимствованной базе
              сравнения и говорит об этом прямо (
              <Link
                href="/ru/razbory/baza-sravneniya"
                className="underline underline-offset-4 hover:text-forest-500"
              >
                разбор базы
              </Link>
              ).
            </p>
            <p>
              <strong className="font-medium text-ink-700">Генотипов книга не хранит.</strong>{' '}
              Хранится результат теста — лаборатория, номер сертификата, метод, число маркеров,
              вывод. Геномный прогноз, о котором говорит Минсельхоз, требует самих маркеров,
              и это отдельная работа, названная в нашем списке пробелов, а не обещанная витриной.
            </p>
            <p>
              <strong className="font-medium text-ink-700">
                Готовность меряется по версии 2.6.0.
              </strong>{' '}
              Шаблоны меняются, и число «{FGIAS_TOTALS.fill} из {FGIAS_TOTALS.columns}» верно
              на дату прогона и для этой версии. Мы обновляем его прогоном, а не оценкой на глаз;
              между прогонами на странице стоит дата, а не «актуально».
            </p>
            <p>
              <strong className="font-medium text-ink-700">
                Сдача файлов не равна участию в индексе.
              </strong>{' '}
              Это необходимое условие, а не достаточное: нужны ещё генотипы, единые номера быков
              и связность родословных между хозяйствами. Обещать хозяйству, что «сдал файл —
              попал в национальную оценку», было бы неправдой в его пользу, а такие неправды
              вскрываются ровно тогда, когда на них уже понадеялись.
            </p>
          </div>
        </section>

        {/* ------------------------ Чего это не доказывает ---------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Чего этот разбор не доказывает
          </h2>

          <div className="mt-5 space-y-4 text-[16px] leading-relaxed text-ink-700">
            <p>
              <strong className="font-medium">Что сроки будут выдержаны.</strong> Мы пересказываем
              планы ведомства с указанием, кто и когда их назвал. Даты в таких планах двигались
              и раньше; наша готовность от этого не зависит, потому что файлы нужны хозяйству
              и без индекса.
            </p>
            <p>
              <strong className="font-medium">Что наш процент готовности — ваш.</strong> Числа
              посчитаны на нашей базе: то, что заполнено у нас, необязательно заполнено у вас.
              Прогон готовности можно повторить на своих данных — он для этого и написан.
            </p>
            <p>
              <strong className="font-medium">
                Что национальный индекс сделает нашу оценку ненужной.
              </strong>{' '}
              Наоборот: он войдёт ещё одним профилем весов на тех же прослеживаемых данных.
              Переделывать книгу под него не придётся — ради этого у базы сравнения и есть версия.
            </p>
          </div>
        </section>

        <TermsSeen slugs={note.terms} />
        <NoteSources note={note} />
        <NoteNeighbours notes={NOTES} current={SLUG} />
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
