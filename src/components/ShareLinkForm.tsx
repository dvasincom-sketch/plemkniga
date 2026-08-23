'use client'

import { useActionState } from 'react'
import { createShareLinkAction, revokeShareLinkAction, type ShareFormState } from '@/actions/share'
import { SHARE_ANIMALS_CAP, SHARE_MAX_DAYS } from '@/lib/share-links'
import { ACCESS_SCOPES } from '@/lib/dictionaries'
import { DateField } from '@/components/DateField'

/**
 * Выпуск ссылки на просмотр.
 *
 * ## Почему номерами, а не выбором из списка
 *
 * Выбор мышью хорош для одной записи и мучителен для тридцати, а тридцать
 * здесь обычное дело: партия на продажу, группа на осмотр, список
 * в страховую. У хозяйства этот список уже есть — в письме, в таблице,
 * в переписке, — и вставить его целиком быстрее, чем отщёлкать по одному.
 * Номера разбираются по любому разделителю и сверяются по ядру номера,
 * поэтому «3662217000196.00» и «3662217000196» — одно и то же.
 *
 * ## Почему адрес показывается, а не отправляется
 *
 * Соблазн приделать «отправить на почту» велик, и он преждевременен:
 * система не знает почты получателя и не должна её знать — в этом и смысл
 * ссылки. Хозяйство отправит адрес тем способом, которым уже общается
 * с этим человеком.
 */
export function ShareLinkForm({ defaultNumber }: { defaultNumber?: string }) {
  const [state, formAction, pending] = useActionState<ShareFormState, FormData>(
    createShareLinkAction,
    {},
  )

  /*
   * Умолчание срока — две недели. Не «месяц» и не «год»: за две недели
   * успевают посмотреть и решить, а забытая ссылка перестаёт работать
   * раньше, чем о ней забудут окончательно. Дату всё равно выбирает
   * человек, умолчание лишь подсказывает порядок величины.
   */
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

  return (
    <form action={formAction} className="card mt-6">
      <h3 className="panel-heading">Выпустить ссылку</h3>

      {/*
         Здесь остались только потолки — то, чего нет в объяснении раздела
         над карточкой. Прежний абзац пересказывал его целиком, и человек
         читал одно и то же дважды подряд: сперва под заголовком, потом
         внутри формы.

         Потолки при этом обязаны быть названы до нажатия, а не в отказе
         (docs/interfeys.md), поэтому они и стоят здесь, у самой формы.
      */}
      <p className="mb-5 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
        В одну ссылку помещается до {SHARE_ANIMALS_CAP} записей, срок — не больше{' '}
        {SHARE_MAX_DAYS} дней. Отозвать можно в любой момент.
      </p>

      {/*
         `block` у поля — не косметика.

         `textarea` и `input` по умолчанию строчные, и внутри подписи
         поле вставало не под текстом, а справа от него: подпись
         «Индивидуальные номера» оказывалась в вертикальной середине
         поля, а само поле — сдвинутым вправо на ширину подписи.
         `w-full` этого не лечит: он задаёт ширину, а не способ показа.
      */}
      <label className="block text-[14px]">
        Индивидуальные номера
        <textarea
          name="numbers"
          required
          rows={3}
          defaultValue={defaultNumber ?? ''}
          placeholder="3662217000196.00, 3921606390144"
          className="field field-on-light mt-1.5 block w-full max-w-[64ch]"
        />
        <span className="mt-1.5 block text-[13px] leading-snug text-ink-500">
          Через запятую, пробел или с новой строки. Только записи вашего хозяйства.
        </span>
      </label>

      <fieldset className="mt-5">
        <legend className="text-[14px]">Что открывает ссылка</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ACCESS_SCOPES.map((s) => (
            <label key={s.value} className="flex items-start gap-3 text-[14px]">
              <input type="checkbox" name="scopes" value={s.value} className="checkbox mt-0.5" />
              <span>
                {s.label}
                <span className="block text-[13px] leading-snug text-ink-500">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/*
         Дата — своим полем, а не нативным `<input type="date">`.

         Нативное поле каждая система рисует по-своему: сегменты
         с системным календарём на macOS, другой календарь на Windows,
         колесо во весь экран на телефоне. В форме, где все остальные
         поля наши, оно читается как чужое — и было ровно тем, за что
         эту страницу и вернули на доработку.

         Ряд выровнен по верху (`items-start`), а не растянут: у поля
         «Для кого» снизу подпись, и при растяжении рамка даты тянулась
         вслед за ней, становясь вдвое выше соседней.
      */}
      <div className="mt-5 flex flex-wrap items-start gap-x-6 gap-y-4">
        <label className="block text-[14px]">
          Действует до (включительно)
          <DateField
            name="expiresAt"
            required
            ariaLabel="Дата, до которой работает ссылка"
            defaultValue={inDays(14)}
            min={inDays(1)}
            max={inDays(SHARE_MAX_DAYS)}
            rangeHint={`Срок — от завтрашнего дня до ${SHARE_MAX_DAYS} дней`}
            className="mt-1.5 w-[22ch]"
          />
        </label>

        <label className="block text-[14px]">
          Для кого
          <input
            name="note"
            placeholder="Иванову на осмотр"
            className="field field-on-light mt-1.5 block w-full max-w-[36ch]"
          />
          <span className="mt-1.5 block text-[13px] leading-snug text-ink-500">
            Видно только вам — чтобы через месяц вспомнить, кому выдали.
          </span>
        </label>
      </div>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}

      {state.unknown && state.unknown.length > 0 && (
        <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
          Не нашлись в вашем стаде и в ссылку не попали:{' '}
          <span className="font-medium">{state.unknown.join(', ')}</span>
        </p>
      )}

      {state.message && state.url && (
        <div className="mt-4 rounded-md bg-brand-50 p-4">
          <p className="text-[14px] font-medium text-forest-600">{state.message}</p>
          {/*
             Адрес показан в поле только для чтения, а не строкой текста:
             из поля его выделяют и копируют одним движением, а строку
             приходится обводить мышью и легко захватить лишнее.
          */}
          <input
            readOnly
            value={state.url}
            onFocus={(e) => e.currentTarget.select()}
            className="field field-on-light mt-3 w-full font-mono text-[13px]"
          />
          <p className="mt-2 text-[13px] leading-snug text-ink-500">
            Отправьте адрес тем способом, которым обычно общаетесь с получателем.
            Кто откроет ссылку — тот и увидит записи.
          </p>
        </div>
      )}

      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Выпускаем…' : 'Выпустить ссылку'}
      </button>
    </form>
  )
}

/** Отзыв — отдельной формой, потому что действие своё и подтверждение своё. */
export function ShareRevokeButton({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState<ShareFormState, FormData>(
    revokeShareLinkAction,
    {},
  )

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-[14px] underline underline-offset-4 hover:text-[#c0392b]"
      >
        {pending ? 'Отзываем…' : 'Отозвать'}
      </button>
      {state.error && <span className="ml-2 text-[13px] text-red-700">{state.error}</span>}
    </form>
  )
}
