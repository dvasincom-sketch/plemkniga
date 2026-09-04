import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AcceptInvite } from '@/components/AcceptInvite'
import { getClient } from '@/lib/payload'
import { resolveInvite } from '@/lib/invitations'

export const metadata: Metadata = {
  title: 'Приглашение в хозяйство',
  /* Адрес одноразовый и именной: в выдаче ему не место. */
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * Страница приглашения.
 *
 * ## Почему недействительное приглашение отвечает одинаково
 *
 * Отозванное, просроченное, уже принятое и никогда не существовавшее
 * дают один и тот же ответ. Разные ответы позволили бы перебором выяснить,
 * что приглашение когда-то было, — а вместе с ним и то, что такая почта
 * связана с этим хозяйством. Тот же довод, что у ссылок на просмотр.
 *
 * ## Почему страница открыта всем
 *
 * Приглашённого в системе ещё нет, и требовать входа было бы кругом:
 * учётная запись заводится здесь и только здесь. Защищает не вход,
 * а токен — 32 случайных байта, которые нечем подобрать.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = await getClient()
  const invite = await resolveInvite(payload, token)

  return (
    <>
      <SiteHeader />

      <main className="container-page pb-8">
        <div className="min-w-0 max-w-[70rem]">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            {invite ? `Приглашение в «${invite.organizationName}»` : 'Приглашение недействительно'}
          </h1>

          {invite ? (
            <>
              <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Хозяйство приглашает вас вести данные в племенной книге. Заведите учётную
                запись — после этого вы попадёте в кабинет хозяйства и увидите его стадо.
              </p>

              <AcceptInvite
                token={token}
                email={invite.email}
                organizationName={invite.organizationName}
                orgRole={invite.orgRole}
              />
            </>
          ) : (
            <div className="card mt-8 max-w-[46rem]">
              <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                Эта ссылка больше не работает. Так бывает с приглашением, которое уже
                приняли, отозвали или которому вышел срок — приглашение действует две
                недели. Попросите хозяйство выпустить новое.
              </p>
              <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
                Если учётная запись у вас уже есть, просто{' '}
                <Link href="/login" className="underline underline-offset-4">
                  войдите
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
