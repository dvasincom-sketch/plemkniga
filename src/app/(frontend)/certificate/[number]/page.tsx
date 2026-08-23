import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { getClient } from '@/lib/payload'
import { checkCertificate, snapshotDiff, CERT_CODE_LENGTH } from '@/lib/certificate-check'
import { DOCUMENT_TYPES, labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import type { Animal } from '@/payload-types'

export const dynamic = 'force-dynamic'

/**
 * Проверка подлинности свидетельства — открыта всем (UC-03).
 *
 * ## Кто сюда приходит
 *
 * Человек с бумагой в руках: покупатель перед сделкой, ветеринар,
 * таможенный инспектор, страховщик. Учётной записи у него нет и не будет.
 * Он навёл камеру на QR или набрал номер и код с бланка, и ему нужен
 * ответ на один вопрос: бумага настоящая или нет.
 *
 * ## Почему страница отвечает так коротко
 *
 * Соблазн показать заодно родословную, оценку и удой велик — данные же
 * есть. Но проверка подлинности и доступ к карточке отвечают на разные
 * вопросы, и смешивать их значит превратить публичную проверку в дыру
 * в правилах видимости: свидетельство есть почти у каждого племенного
 * животного, и по QR открывалась бы вся книга.
 *
 * Показано ровно то, что напечатано на самом бланке крупным шрифтом,
 * плюс два ответа, которых на бумаге быть не может: действует ли документ
 * сейчас и не разошлись ли данные книги с напечатанными.
 */
export const metadata: Metadata = {
  title: 'Проверка свидетельства',
  robots: { index: false, follow: false },
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <>
    <SiteHeader active="/" />
    <main className="container-page pb-8">
      <div className="mt-8 max-w-[70ch]">
        <p className="text-[12px] uppercase tracking-[0.09em] text-ink-500">
          Проверка подлинности документа
        </p>
        {children}
      </div>
    </main>
    <SiteFooter />
  </>
)

export default async function CertificateCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>
  searchParams: Promise<{ k?: string }>
}) {
  const { number } = await params
  const { k } = await searchParams

  const payload = await getClient()
  const result = await checkCertificate(payload, decodeURIComponent(number), k)

  if (result.status === 'unknown') {
    return (
      <Shell>
        <h1 className="mt-1 text-[30px] font-medium leading-tight sm:text-[36px]">
          Такого документа нет
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
          В книге не значится документ с номером{' '}
          <span className="font-medium">{decodeURIComponent(number)}</span>. Проверьте, точно ли
          переписан номер с бланка. Если номер верен — документ Ассоциацией не выдавался.
        </p>
        <Link href="/" className="btn btn-brand mt-7">
          Открыть племенную книгу
        </Link>
      </Shell>
    )
  }

  if (result.status === 'need-code') {
    return (
      <Shell>
        <h1 className="mt-1 text-[30px] font-medium leading-tight sm:text-[36px]">
          Нужен код с бланка
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
          Документ № <span className="font-medium">{result.number}</span> в книге есть. Чтобы
          увидеть его данные, введите код проверки — {CERT_CODE_LENGTH} знаков рядом
          с QR-кодом на бланке.
        </p>
        {/*
           Код спрашивается, а не подставляется ссылкой: он и есть
           доказательство, что бумага у вас в руках. Обычная форма
           методом GET — так работает и без JavaScript, и в браузере
           инспектора на таможне.
        */}
        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="block text-[14px]">
            Код проверки
            <input
              name="k"
              required
              autoFocus
              maxLength={16}
              placeholder="XXXXXXXX"
              className="field field-on-light mt-1.5 block w-[22ch] font-mono uppercase tracking-widest"
            />
          </label>
          <button type="submit" className="btn btn-brand">
            Проверить
          </button>
        </form>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-500">
          Регистр и пробелы значения не имеют. Если код не подходит, а бланк на руках —
          обратитесь в Ассоциацию: возможно, документ выпущен до появления проверки.
        </p>
      </Shell>
    )
  }

  const doc = result.doc
  const animal = (typeof doc.animal === 'object' ? doc.animal : null) as Animal | null
  const revokedAt = doc.revoked?.at ?? null
  const diffs = animal ? snapshotDiff(doc.snapshot, animal) : []
  const hasSnapshot = Boolean(doc.snapshot)

  return (
    <Shell>
      <h1 className="mt-1 text-[30px] font-medium leading-tight sm:text-[36px]">
        {revokedAt ? 'Документ отозван' : 'Документ подлинный'}
      </h1>

      <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
        {revokedAt ? (
          <>
            Документ № <span className="font-medium">{doc.number}</span> был выдан Ассоциацией,
            но отозван {dateRu(revokedAt)}. Полагаться на него нельзя.
            {doc.revoked?.reason ? ` Причина: ${doc.revoked.reason}` : ''}
          </>
        ) : (
          <>
            Документ № <span className="font-medium">{doc.number}</span> выдан Ассоциацией
            {doc.issuedAt ? ` ${dateRu(doc.issuedAt)}` : ''} и действует.
          </>
        )}
      </p>

      <dl className="mt-7 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,20ch)_1fr]">
        <dt className="text-[14px] text-ink-500">Вид документа</dt>
        <dd className="text-[15px]">{labelOf(DOCUMENT_TYPES, doc.type)}</dd>

        <dt className="text-[14px] text-ink-500">Животное</dt>
        <dd className="text-[15px]">
          {animal?.name ?? '—'}
          {animal?.identNumber ? `, инд. № ${animal.identNumber}` : ''}
        </dd>

        <dt className="text-[14px] text-ink-500">Дата рождения</dt>
        <dd className="text-[15px]">{animal?.birthDate ? dateRu(animal.birthDate) : '—'}</dd>

        <dt className="text-[14px] text-ink-500">Хозяйство</dt>
        <dd className="text-[15px]">
          {typeof animal?.owner === 'object' && animal.owner ? animal.owner.name : '—'}
        </dd>
      </dl>

      {/*
         Сверка бумаги с книгой — то, ради чего проверка и нужна.

         «Документ существует» знает и подделыватель: номер можно
         списать с настоящего бланка. А вот что данные с тех пор
         не менялись, знает только книга.
      */}
      <section className="mt-8">
        <h2 className="text-[19px] font-medium">Данные с момента выдачи</h2>
        {!hasSnapshot ? (
          <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
            Сверить не с чем: документ выпущен до того, как книга начала сохранять снимок
            данных на момент выдачи. Сведения выше показаны по нынешнему состоянию книги.
          </p>
        ) : diffs.length === 0 ? (
          <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
            Не менялись: то, что напечатано на бланке, совпадает с тем, что в книге сейчас.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
              После выдачи книга изменилась. Это не значит, что бланк поддельный, —
              животное могло сменить владельца, а запись могли поправить. Но сделку
              стоит вести по нынешним данным.
            </p>
            <table className="metric-table mt-4">
              <thead>
                <tr>
                  <th>Поле</th>
                  <th>На бланке</th>
                  <th>В книге сейчас</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d) => (
                  <tr key={d.label}>
                    <td>{d.label}</td>
                    <td>{d.onPaper}</td>
                    <td className="font-medium">{d.inBook}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <p className="mt-8 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
        Проверка отвечает на вопрос о подлинности бумаги и не открывает карточку животного:
        продуктивность, оценку и родословную показывает хозяйство-владелец — по своему
        решению или по ссылке, которую выдаёт само.
      </p>
    </Shell>
  )
}
