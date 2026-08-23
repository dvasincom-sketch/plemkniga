'use client'

import { useState } from 'react'
import { Select } from './Select'
import { FileExportIcon } from './CardIcons'
import { EXPORT_FORMATS, EXPORT_LIMIT, exportFormat } from '@/lib/export-formats'

/**
 * Выгрузка стада файлом.
 *
 * ## Что здесь было написано
 *
 * «Выберете нужные вам данные и скачайте в форматах pdf, xls/xlsx, csv,
 * json, xml». Неправдой было почти всё. Выбрать данные нельзя — уходит
 * стадо целиком. PDF и XLSX не поддерживались никогда. Форматов было два.
 * И «выберете» вместо «выберите» — в первой же строке карточки.
 *
 * Текст, обещающий больше, чем система умеет, стоит дороже отсутствующего:
 * хозяйство выбирает нашу платформу под свою программу учёта, а узнаёт
 * правду после трёх нажатий.
 *
 * Теперь список форматов не пишется словами, а собирается из реестра —
 * того же, по которому работает обработчик. Пообещать несуществующий
 * формат больше нельзя.
 *
 * ## Потолок назван до нажатия, а не после
 *
 * В файл уходит до двадцати тысяч записей. Молчаливый потолок здесь
 * опаснее обычного: файл выглядит целым, по нему считают средние —
 * и не знают, что последних записей в нём нет.
 */
export function ExportCard() {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState(EXPORT_FORMATS[0]!.value)

  const current = exportFormat(format)

  return (
    /* Якорь `export` — на него ведёт кнопка «Выгрузка» из «Моих животных»:
       страница называется «Загрузка и выгрузка», и без якоря человек,
       нажавший «выгрузка», попадал бы на загрузку */
    <div id="export" className="card flex scroll-mt-8 items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-[21px] font-medium">Экспорт данных</h3>
        <p className="mt-1.5 text-[13px] text-ink-500">
          Всё ваше стадо одним файлом: {EXPORT_FORMATS.map((f) => f.label).join(', ')}
        </p>

        <div className="mt-5">
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn btn-brand">
            Экспортировать данные
          </button>

          {open && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  name="format"
                  ariaLabel="Формат выгрузки"
                  placeholder=""
                  onLight
                  defaultValue={format}
                  onChange={setFormat}
                  options={EXPORT_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
                  className="w-40"
                />
                <a href={`/account/export?format=${current.value}`} className="btn btn-forest">
                  Скачать
                </a>
              </div>

              {/*
                 Подсказка меняется вместе с форматом и стоит под ним,
                 а не в общем списке. Выбор здесь делают один раз и всерьёз:
                 XML забирают в чужую программу учёта, и ошибиться форматом
                 — значит выяснить это уже на той стороне.
              */}
              <p className="mt-2 text-[13px] leading-snug text-ink-500">{current.hint}</p>

              <p className="mt-2 text-[13px] leading-snug text-ink-500">
                Уходит до {EXPORT_LIMIT.toLocaleString('ru-RU')} записей стада, отсортированных
                по индивидуальному номеру.
              </p>
            </div>
          )}
        </div>
      </div>

      <FileExportIcon />
    </div>
  )
}
