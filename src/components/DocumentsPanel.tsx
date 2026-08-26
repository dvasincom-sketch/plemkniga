import Link from 'next/link'
import type { Document as BookDocument } from '@/payload-types'
import { DOCUMENT_TYPES, labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import { Select } from '@/components/Select'
import { InfoTip } from '@/components/InfoTip'
import { Pagination } from '@/components/Pagination'
import {
  DOC_FILTER_KEYS,
  DOC_ORIGINS,
  DOC_STATES,
  describeDocumentFilter,
  documentsHrefWithout,
  one,
  type SearchParams,
} from '@/lib/document-query'

/**
 * Документы хозяйства: отбор и таблица.
 *
 * ## Что здесь на самом деле лежит
 *
 * Не только бумаги Ассоциации. Раздел называется «Документы» и относится
 * к стаду, а не к Ассоциации: рядом со свидетельством стоит отчёт
 * о генотипировании из лаборатории, ветеринарная справка, договор
 * купли-продажи. Так и задумано — хозяйство ищет бумагу на животное,
 * а не бумагу определённого происхождения.
 *
 * Но разница между ними существенная, и до сих пор её было не видно:
 * свидетельство подписала Ассоциация и отвечает за него, а справку
 * хозяйство загрузило само, и книга о ней не знает ничего, кроме файла.
 * Одинаковые строки в таблице означали, что за отчёт из лаборатории
 * книга ручается так же, как за собственное свидетельство. Теперь
 * происхождение — колонка и условие отбора.
 *
 * ## Почему отбор именно такой
 *
 * Документов у стада в сотню голов быстро становится за двести, и это
 * не список, а архив: в архиве ищут конкретную бумагу, а не листают.
 * Отсюда семь условий и ни одного лишнего: номер бланка, номер животного,
 * тип, происхождение, состояние и период выдачи — всё, по чему бумагу
 * вообще вспоминают.
 *
 * Сортировки нет: документы всегда от новых к старым. Архив, в котором
 * можно переставить порядок, перестаёт быть архивом — человек теряет
 * представление о том, где «недавнее».
 *
 * ## Состояние по умолчанию — действующие
 *
 * Отозванный документ не удаляют, и в общем списке он выглядит наравне
 * с действующим. Показывать его по умолчанию значило бы предлагать
 * сослаться на недействующую бумагу; прятать совсем — переписывать
 * прошлое. Поэтому он за переключателем, и переключатель назван.
 */

/**
 * Документы, которые может выдать только Ассоциация.
 *
 * Свидетельство и зоотехнический сертификат юридически значимы, и подпись
 * под ними ставит Ассоциация. Такой документ с пустым «кем выдан» —
 * не «загружен хозяйством», а противоречие: подписывать его больше некому.
 *
 * Нашлось это ровно тогда, когда появилась колонка «кем выдан»: до неё
 * пустое поле не было видно нигде, и демонстрационное свидетельство
 * годами показывалось как чужая бумага, за которую книга не отвечает.
 */
const ASSOCIATION_ONLY = new Set(['pedigreeCertificate', 'zootechnicalCertificate'])

/** Ссылка на бланк — только у того, что выпускала Ассоциация. */
const formHref = (d: BookDocument): string | null => {
  if (!d.issuedBy) return null
  if (d.type !== 'pedigreeCertificate' && d.type !== 'zootechnicalCertificate') return null
  const animalId = typeof d.animal === 'object' && d.animal ? d.animal.id : d.animal
  if (!animalId) return null
  const kind = d.type === 'zootechnicalCertificate' ? 'zootechnical' : 'pedigree'
  return `/animals/${animalId}/certificate/${kind}?document=${d.id}`
}

/** Ссылка на сам файл — у загруженных хозяйством. */
const fileHref = (d: BookDocument): string | null => {
  const f = d.file
  return typeof f === 'object' && f && typeof f.url === 'string' ? f.url : null
}

export function DocumentsPanel({
  docs,
  total,
  page,
  totalPages,
  sp,
  hasFilters,
}: {
  docs: BookDocument[]
  total: number
  page: number
  totalPages: number
  sp: SearchParams
  hasFilters: boolean
}) {
  /*
   * Фишки собираются перебором ключей, а не по тому, что пришло в адресе:
   * порядок условий тогда задаёт список, а не случайный порядок
   * параметров в строке. Одно и то же условие должно стоять на одном
   * и том же месте от запроса к запросу — иначе крестик приходится
   * искать заново каждый раз.
   */
  const chips = DOC_FILTER_KEYS.flatMap((k) => {
    const described = describeDocumentFilter(k, one(sp[k]))
    return described ? [{ key: k as string, ...described }] : []
  })

  return (
    <section className="mt-8">
      {/* ----------------------------- Отбор ----------------------------- */}
      <form method="GET" action="/account" className="card">
        {/*
           Скрытые поля держат раздел: без них отправка формы уводила бы
           на «Обзор», и человек, нажавший «Найти», терял бы то место,
           где искал.
        */}
        <input type="hidden" name="tab" value="herd" />
        <input type="hidden" name="sub" value="documents" />

        <div className="mb-4 flex items-baseline gap-2">
          <h2 className="panel-heading mb-0">Найти документ</h2>
          <InfoTip label="Что лежит в этом разделе">
            <p className="mb-2 font-medium text-ink-900">Не только бумаги Ассоциации</p>
            <p className="mb-2">
              Раздел относится к стаду, а не к Ассоциации: рядом со свидетельством стоит
              отчёт о генотипировании, ветеринарная справка, договор. Хозяйство ищет
              бумагу на животное, а не бумагу определённого происхождения.
            </p>
            <p>
              Но разница между ними существенная. За свидетельство отвечает Ассоциация:
              у него есть номер, код проверки и снимок данных на момент выпуска. Справку
              хозяйство загрузило само, и книга не знает о ней ничего, кроме файла.
              Поэтому «кем выдан» — отдельная колонка и отдельное условие.
            </p>
          </InfoTip>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="field"
            name="dnum"
            placeholder="Номер документа"
            defaultValue={one(sp.dnum)}
          />
          <input
            className="field"
            name="danimal"
            placeholder="Номер животного"
            defaultValue={one(sp.danimal)}
          />
          {/*
             Своя пустая строка вместо стандартной подсказки списка:
             у «типа» это «любой», у происхождения и состояния —
             осмысленные значения по умолчанию, и лишняя пустая строка
             читалась бы как «не выбрано», хотя выбор уже сделан.
          */}
          <Select
            name="dtype"
            placeholder=""
            onLight
            ariaLabel="Тип документа"
            defaultValue={one(sp.dtype)}
            options={[
              { value: '', label: 'Любой тип' },
              ...DOCUMENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
            ]}
          />
          <Select
            name="dorigin"
            placeholder=""
            onLight
            ariaLabel="Кем выдан"
            defaultValue={one(sp.dorigin) || 'all'}
            options={DOC_ORIGINS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <Select
            name="dstate"
            placeholder=""
            onLight
            ariaLabel="Состояние"
            defaultValue={one(sp.dstate) || 'active'}
            options={DOC_STATES.map((o) => ({ value: o.value, label: o.label }))}
          />
          {/*
             Даты подписаны, а не спрятаны в placeholder: у поля с датой
             его не видно, пока поле пустое, и два одинаковых календаря
             подряд невозможно различить.
          */}
          <label className="flex items-center gap-2 text-[14px] text-ink-500">
            <span className="whitespace-nowrap">Выдан с</span>
            <input className="field" type="date" name="dfrom" defaultValue={one(sp.dfrom)} />
          </label>
          <label className="flex items-center gap-2 text-[14px] text-ink-500">
            <span className="whitespace-nowrap">по</span>
            <input className="field" type="date" name="dto" defaultValue={one(sp.dto)} />
          </label>
          <button type="submit" className="btn btn-accent">
            Найти
          </button>
        </div>
      </form>

      {/* -------------------------- Что отобрано -------------------------- */}
      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px]">
          <span className="text-ink-500">Условия:</span>
          {chips.map((c) => (
            <Link
              key={c.key}
              href={documentsHrefWithout(sp, c.key)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-colors hover:bg-[#f6f6f6]"
              title="Снять условие"
            >
              <span className="text-ink-500">{c.label}:</span>
              <span>{c.value}</span>
              <span aria-hidden="true" className="text-ink-400">
                ×
              </span>
            </Link>
          ))}
          <Link
            href={documentsHrefWithout({})}
            className="underline underline-offset-4 hover:text-forest-500"
          >
            Сбросить всё
          </Link>
        </div>
      )}

      {/* ---------------------------- Таблица ---------------------------- */}
      <div className="card mt-5">
        <div className="overflow-x-auto">
          <table className="metric-table min-w-[860px]">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Номер</th>
                <th>Название</th>
                <th>Животное</th>
                <th>Кем выдан</th>
                <th>Состояние</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-ink-500">
                    {hasFilters
                      ? 'По заданным условиям документов не найдено'
                      : 'Документов пока нет. Племенные свидетельства выпускает Ассоциация после верификации записи; свои бумаги можно загрузить в разделе «Данные».'}
                  </td>
                </tr>
              )}

              {docs.map((d) => {
                const form = formHref(d)
                const file = fileHref(d)
                const revoked = Boolean(d.revoked?.at)

                return (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap">{dateRu(d.issuedAt)}</td>
                    <td>{labelOf(DOCUMENT_TYPES, d.type)}</td>
                    <td className="whitespace-nowrap tabular-nums">{d.number || '—'}</td>
                    <td>{d.title}</td>
                    <td>
                      {typeof d.animal === 'object' && d.animal ? (
                        <Link
                          href={`/animals/${d.animal.id}`}
                          className="underline underline-offset-2 hover:text-forest-500"
                        >
                          {d.animal.identNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    {/*
                       Кем выдан — главное различие в этой таблице.
                       «Вы» набрано бледнее не для красоты: за свою бумагу
                       книга не ручается, и колонка должна это показывать
                       раньше, чем человек прочитает подпись.
                    */}
                    <td className="whitespace-nowrap">
                      {d.issuedBy ? (
                        'Ассоциация'
                      ) : ASSOCIATION_ONLY.has(d.type ?? '') ? (
                        <span
                          className="cell-flag"
                          title="Такой документ выдаёт только Ассоциация, а кто именно — не записано. Обратитесь в Ассоциацию: подпись под свидетельством должна быть названа"
                        >
                          не указан
                        </span>
                      ) : (
                        <span
                          className="text-ink-500"
                          title="Загружено хозяйством: книга за содержание такой бумаги не отвечает"
                        >
                          Вы
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {revoked ? (
                        <span
                          className="rounded-md bg-[#fdecea] px-2 py-0.5 text-[13px] text-[#8a2d22]"
                          title={d.revoked?.reason ?? undefined}
                        >
                          отозван {dateRu(d.revoked?.at)}
                        </span>
                      ) : (
                        <span
                          className="text-ink-500"
                          title="Срока действия у документа нет: он действует, пока Ассоциация его не отзовёт"
                        >
                          действует
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {/*
                         Бланк и файл — разные вещи, и ссылка называется
                         по-разному. Бланк собирается книгой из снимка
                         данных; файл лежит как загрузили. Одно слово
                         на оба означало бы, что книга ручается и за файл.
                      */}
                      {form && (
                        <Link
                          href={form}
                          className="underline underline-offset-4 hover:text-forest-500"
                        >
                          бланк
                        </Link>
                      )}
                      {!form && file && (
                        <a
                          href={file}
                          className="underline underline-offset-4 hover:text-forest-500"
                        >
                          файл
                        </a>
                      )}
                      {!form && !file && <span className="text-ink-400">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ----------------------------- Подвал ----------------------------- */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <span className="text-[14px] text-ink-500">
          Показано {docs.length} из {total}
          {hasFilters && ' (с учётом отбора)'}
        </span>
        <Pagination
          page={page}
          totalPages={totalPages}
          searchParams={{ ...sp, tab: 'herd', sub: 'documents' }}
          basePath="/account"
        />
      </div>

      {/*
         Заказать документ отсюда нельзя, и молчать об этом хуже, чем
         сказать. Свидетельство выпускает Ассоциация, и путь к нему один
         — через верификацию записи. Раздел, который показывает выданное
         и не говорит, как получить, читается как поломка.
      */}
      <p className="mt-6 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
        Племенное свидетельство и зоотехнический сертификат выпускает Ассоциация — сама,
        после того как запись прошла верификацию. Заказать их кнопкой нельзя: подпись
        ставят под проверенными данными.{' '}
        <Link
          href="/account/verification"
          className="underline underline-offset-4 hover:text-forest-500"
        >
          Подать записи на верификацию
        </Link>
        . Свои бумаги — справки, договоры, отчёты лабораторий — загружаются в разделе
        «Данные» и остаются вашими: книга их хранит, но за содержание не отвечает.
      </p>
    </section>
  )
}
