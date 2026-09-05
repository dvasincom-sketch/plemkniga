import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { getClient } from '@/lib/payload'
import { resolveShare, noteShareOpen, SHARE_GONE } from '@/lib/share-links'
import { ACCESS_SCOPES, labelOf } from '@/lib/dictionaries'
import { dateRu, nf, plural } from '@/lib/format'
import { after } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Страница ссылки на просмотр.
 *
 * ## Кто сюда приходит
 *
 * Человек без учётной записи, которому прислали адрес: покупатель,
 * ветеринар, оценщик, страховой агент. Он не знает ни книги, ни правил,
 * и первое, что должен понять, — чьи это записи, что именно ему открыто
 * и до какого числа. Поэтому страница начинается с объяснения, а не
 * с таблицы.
 *
 * ## Почему её не индексируют
 *
 * Токен лежит в адресе. Попади адрес в поисковый указатель — и ссылка,
 * выпущенная одному человеку, откроется любому, кто наберёт кличку
 * коровы в поиске. `noindex` здесь не предосторожность, а часть правила
 * «видит тот, кому дали».
 */
export const metadata: Metadata = {
  title: 'Записи по ссылке',
  robots: { index: false, follow: false },
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const payload = await getClient()
  const share = await resolveShare(payload, token)

  if (!share) {
    return (
      <>
        <SiteHeader active="/" />
        <main className="container-page pb-8">
          <div className="mt-10 max-w-[70ch]">
            <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
              Ссылка не работает
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-ink-700">{SHARE_GONE}</p>
            <Link href="/" className="btn btn-brand mt-7">
              Открыть племенную книгу
            </Link>
          </div>
        </main>
        <SiteFooter />
      </>
    )
  }

  /*
   * Открытие считается после ответа страницы, а не до него.
   *
   * Обновление ссылки — запись в базу, и ставить её на пути показа
   * значит задерживать посетителя ради сведения, которое нужно не ему.
   */
  after(() => noteShareOpen(payload, share.id, share.opens))

  const [{ docs: animals }, org] = await Promise.all([
    payload.find({
      collection: 'animals',
      where: { id: { in: [...share.animalIds] } },
      limit: share.animalIds.size,
      depth: 1,
      overrideAccess: true,
      sort: 'identNumber',
    }),
    share.owner
      ? payload
          .findByID({ collection: 'organizations', id: share.owner, depth: 0, overrideAccess: true })
          .catch(() => null)
      : Promise.resolve(null),
  ])

  const scopeLabels = [...share.scopes].map((s) => labelOf(ACCESS_SCOPES, s))

  return (
    <>
      <SiteHeader active="/" />

      <main className="container-page pb-8">
        <div className="mt-8 max-w-[80ch]">
          <p className="text-[12px] uppercase tracking-[0.09em] text-ink-500">Ссылка на просмотр</p>
          <h1 className="mt-1 text-[30px] font-medium leading-tight sm:text-[36px]">
            {animals.length} {plural(animals.length, 'запись', 'записи', 'записей')}
            {org?.name ? ` хозяйства «${org.name}»` : ''}
          </h1>

          <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
            Хозяйство открыло вам эти записи по ссылке. Открыто:{' '}
            <span className="font-medium">{scopeLabels.join(', ').toLowerCase()}</span>. Ссылка
            работает до{' '}
            <span className="font-medium">{dateRu(share.expiresAt)}</span> включительно, после чего
            перестанет открываться — сохраните нужное заранее.
          </p>

          {/*
             Сказано прямо, что ссылка передаётся дальше.

             Соблазн умолчать велик: фраза выглядит как признание слабости.
             Но она честна — токен в адресе открывает записи всякому, кому
             его перешлют, — и адресат должен знать, что обращаться
             с адресом надо как с самими данными.
          */}
          <p className="mt-3 text-[14px] leading-relaxed text-ink-500">
            Адрес этой страницы и есть ключ к записям: у кого он есть, тот их и видит.
            Не пересылайте его дальше без ведома хозяйства.
          </p>
        </div>

        <section className="mt-8">
          <div className="overflow-x-auto rounded-card">
            <table className="w-full border-collapse text-[15px]">
              <thead>
                <tr className="bg-forest-500 text-left text-white">
                  <th className="px-4 py-3 font-normal">Инд.№</th>
                  <th className="px-4 py-3 font-normal">Кличка</th>
                  <th className="px-4 py-3 font-normal">Пол</th>
                  <th className="px-4 py-3 text-right font-normal">Удой, кг</th>
                  <th className="px-4 py-3 text-right font-normal">Жир (%)</th>
                  <th className="px-4 py-3 text-right font-normal">Белок (%)</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {animals.map((a) => (
                  <tr key={a.id} className="border-b border-[#ececec] bg-white last:border-0">
                    <td className="px-4 py-3 tabular-nums">{a.identNumber}</td>
                    <td className="px-4 py-3 font-medium">{a.name ?? '—'}</td>
                    <td className="px-4 py-3">{a.sex === 'male' ? 'М' : 'Ж'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {nf(a.summary?.milkYield, 1)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {nf(a.summary?.fatPercent, 2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {nf(a.summary?.proteinPercent, 2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/*
                         Токен передаётся дальше в адресе карточки: без него
                         карточка закрыта, и посетитель по ссылке упрётся
                         в замок ровно там, куда его и позвали.
                      */}
                      <Link
                        href={`/animals/${a.id}?share=${token}`}
                        className="underline underline-offset-4 hover:text-forest-500"
                      >
                        Открыть карточку
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {animals.length === 0 && (
            <p className="mt-4 text-[14px] text-ink-500">
              Записей в ссылке не осталось — возможно, хозяйство убрало их из книги.
            </p>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
