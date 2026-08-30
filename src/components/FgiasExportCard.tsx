'use client'

import { useState } from 'react'
import { FGIAS_EXPORTS, fgiasExport } from '@/lib/fgias-exports'

/**
 * Выгрузка в шаблоны ФГИАС ПР — карточка кабинета.
 *
 * ## Почему отдельно от «Экспорта данных»
 *
 * В общей выгрузке выбирают, *чем* открыть файл: XLSX, CSV, XML. Все они
 * отдают одну и ту же таблицу стада. ФГИАС — не формат, а получатель:
 * другой состав колонок, другие заголовки, значения ключами вместо слов
 * и три разных шаблона вместо одной таблицы.
 *
 * Шестым пунктом в том же выпадающем списке он читался бы как «ещё один
 * способ сохранить своё стадо», и человек выбрал бы его, ожидая
 * привычные колонки.
 *
 * ## Порядок шаблонов — это порядок работ
 *
 * «Основные сведения» первыми не по алфавиту: без них два других шаблона
 * пусты, потому что номера животных приходят обратным файлом только после
 * их сдачи. Поэтому под списком стоит не подсказка про формат,
 * а последовательность из трёх шагов — она отвечает на вопрос, который
 * иначе задают письмом.
 */
export function FgiasExportCard() {
  const [open, setOpen] = useState(false)
  const [template, setTemplate] = useState(FGIAS_EXPORTS[0]!.key)

  const current = fgiasExport(template)

  return (
    <div id="fgias" className="card h-fit scroll-mt-8">
      <h3 className="text-[21px] font-medium">Выгрузка во ФГИАС ПР</h3>
      <p className="mt-1.5 max-w-[80ch] text-[13px] leading-snug text-ink-500">
        Файлы по шаблонам государственного реестра — теми же заголовками, какими их читает
        реестр. Загружать в реестр их надо самостоятельно: обмена по сети у ФГИАС ПР нет,
        только шаблоны.
      </p>

      <div className="mt-5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn btn-brand">
          Собрать файл для реестра
        </button>

        {open && (
          <div className="mt-4">
            <div className="flex flex-col gap-2">
              {FGIAS_EXPORTS.map((f) => (
                <label key={f.key} className="flex items-start gap-3 text-[14px]">
                  <input
                    type="radio"
                    name="fgias-template"
                    value={f.key}
                    checked={template === f.key}
                    onChange={() => setTemplate(f.key)}
                    className="mt-1"
                  />
                  <span>
                    {f.label}
                    <span className="block text-[13px] leading-snug text-ink-500">{f.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4">
              <a
                href={`/account/export/fgias?template=${current.key}`}
                className="btn btn-forest"
              >
                Скачать «{current.label}»
              </a>
            </div>

            {/*
               Порядок работ — под `details`, как и справка в загрузке.

               Он нужен один раз: прочитав его, хозяйство знает, почему
               «Родословная» пустая, и второй раз к нему не возвращается.
               Держать его развёрнутым значило бы каждый раз загораживать
               кнопку четырьмя абзацами ради одного первого прочтения.

               Но и убрать нельзя: вопрос «почему файл пустой» задают
               письмом ровно потому, что этой последовательности нигде
               не написано.
            */}
            <details className="mt-5 border-t border-ink-200 pt-3">
              <summary className="cursor-pointer list-none text-[13px] text-ink-500 hover:text-ink-700">
                <span className="underline underline-offset-4">
                  Почему файл может быть пустым и что делать
                </span>
              </summary>

              <div className="mt-3 max-w-[80ch] space-y-2 text-[13px] leading-snug text-ink-500">
                <p>
                  1. Сдать «Основные сведения» — там животное названо ключом книги, а не номером
                  реестра.
                </p>
                <p>
                  2. Получить из реестра обратный файл: тот же шаблон, но с проставленными
                  базовыми номерами.
                </p>
                <p>
                  3. Загрузить его сюда обычной загрузкой — книга узнает колонки ФГИАС и разложит
                  номера по карточкам.
                </p>
                <p>4. После этого лактации и родословная перестанут быть пустыми.</p>
                <p className="pt-1">
                  Число строк стоит в имени файла: пустой файл видно ещё в списке загрузок,
                  не открывая. Строки, где не хватает обязательного для реестра поля, не уезжают —
                  иначе реестр отверг бы файл целиком и не сказал бы, из-за какой колонки.
                </p>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}
