'use client'

import { useActionState, useState } from 'react'
import { registerAction, type AuthState } from '@/actions/auth'
import { REGIONS, ROLES } from '@/lib/dictionaries'

const STEPS = ['Роль', 'Организация', 'Контактное лицо', 'Доступ'] as const

type Role = 'farmer' | 'service' | 'individual'

const roleOptions = ROLES.filter((r) => r.value !== 'admin') as unknown as {
  value: Role
  label: string
  hint: string
}[]

function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-8 flex items-center" aria-label={`Шаг ${step + 1} из ${STEPS.length}`}>
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center last:flex-none">
          <span
            className={`flex h-7 w-7 flex-none items-center justify-center rounded-full transition-colors ${
              i <= step ? 'bg-brand-500' : 'bg-ink-100'
            }`}
            title={label}
          >
            <span
              className={`h-3 w-3 rounded-full ${i <= step ? 'bg-white' : 'bg-white/70'}`}
              aria-hidden="true"
            />
          </span>
          {i < STEPS.length - 1 && (
            <span
              className={`mx-2 h-px flex-1 ${i < step ? 'bg-brand-500' : 'border-t border-dashed border-ink-300'}`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

const label = 'mb-1.5 block text-sm text-ink-700'

export function RegisterWizard() {
  const [step, setStep] = useState(0)
  const [role, setRole] = useState<Role>('farmer')
  const [state, formAction, pending] = useActionState<AuthState, FormData>(registerAction, {})

  const isIndividual = role === 'individual'

  return (
    <div className="rounded-[20px] bg-white p-7 sm:p-10">
      <Stepper step={step} />

      <form action={formAction}>
        <input type="hidden" name="role" value={role} />

        {/* --------------------------- Шаг 1: роль --------------------------- */}
        <section hidden={step !== 0}>
          <h2 className="mb-4 text-[34px] font-medium leading-none sm:text-[40px]">Шаг № 1</h2>
          <p className="mb-7 text-[15px]">
            <span className="font-semibold">Выберите роль</span> — укажите вашу основную
            деятельность
          </p>

          <div className="space-y-3">
            {roleOptions.map((o, i) => {
              const active = role === o.value
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => setRole(o.value)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-4 rounded-xl px-5 py-4 text-left transition-colors ${
                    active ? 'bg-forest-500 text-white' : 'bg-[#f2f2f2] text-ink-900 hover:bg-ink-100'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                      active ? 'border-white' : 'border-ink-300'
                    }`}
                  >
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </span>
                  <span className="text-[15px]">
                    <span className="font-semibold tabular-nums">0{i + 1}</span>
                    <span className="mx-3 font-semibold">{o.label}</span>
                    {o.hint && <span className="opacity-90">— {o.hint}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* ----------------------- Шаг 2: организация ------------------------ */}
        <section hidden={step !== 1}>
          <h2 className="mb-4 text-[34px] font-medium leading-none sm:text-[40px]">Шаг № 2</h2>
          <p className="mb-7 text-[15px]">
            <span className="font-semibold">
              {isIndividual ? 'Ваши данные' : 'Данные организации'}
            </span>{' '}
            — реквизиты для проверки заявки
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={label}>
                {isIndividual ? 'Наименование хозяйства (ЛПХ)' : 'Полное наименование'}
              </span>
              <input
                name="orgName"
                className="field field-on-light"
                placeholder={isIndividual ? 'ЛПХ Иванов И.И.' : 'ЗАО «Назаровское»'}
              />
            </label>
            <label>
              <span className={label}>ИНН</span>
              <input name="inn" inputMode="numeric" className="field field-on-light" placeholder="6300000000" />
            </label>
            <label>
              <span className={label}>Регион</span>
              <select name="region" className="field field-on-light" defaultValue="">
                <option value="">Выберите регион</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className={label}>Адрес</span>
              <input name="address" className="field field-on-light" placeholder="город, улица, дом" />
            </label>
          </div>
        </section>

        {/* --------------------- Шаг 3: контактное лицо ---------------------- */}
        <section hidden={step !== 2}>
          <h2 className="mb-4 text-[34px] font-medium leading-none sm:text-[40px]">Шаг № 3</h2>
          <p className="mb-7 text-[15px]">
            <span className="font-semibold">Контактное лицо</span> — кто будет работать в системе
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label>
              <span className={label}>Фамилия *</span>
              <input name="lastName" required className="field field-on-light" placeholder="Иванов" />
            </label>
            <label>
              <span className={label}>Имя *</span>
              <input name="firstName" required className="field field-on-light" placeholder="Иван" />
            </label>
            <label>
              <span className={label}>Отчество</span>
              <input name="middleName" className="field field-on-light" placeholder="Иванович" />
            </label>
            <label>
              <span className={label}>Должность</span>
              <input
                name="position"
                className="field field-on-light"
                placeholder="Зоотехник-селекционер"
              />
            </label>
            <label className="sm:col-span-2">
              <span className={label}>Телефон</span>
              <input
                name="phone"
                type="tel"
                className="field field-on-light"
                placeholder="+7 900 000-00-00"
              />
            </label>
          </div>
        </section>

        {/* ------------------------- Шаг 4: доступ --------------------------- */}
        <section hidden={step !== 3}>
          <h2 className="mb-4 text-[34px] font-medium leading-none sm:text-[40px]">Шаг № 4</h2>
          <p className="mb-7 text-[15px]">
            <span className="font-semibold">Данные для входа</span> — e-mail станет вашим логином
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={label}>E-mail *</span>
              <input
                name="email"
                type="email"
                required
                className="field field-on-light"
                placeholder="zootech@example.ru"
              />
            </label>
            <label>
              <span className={label}>Пароль * (не менее 8 символов)</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="field field-on-light"
              />
            </label>
            <label>
              <span className={label}>Повторите пароль *</span>
              <input
                name="passwordConfirm"
                type="password"
                required
                minLength={8}
                className="field field-on-light"
              />
            </label>
          </div>

          <label className="mt-5 flex items-start gap-3 text-sm text-ink-700">
            <input
              type="checkbox"
              name="acceptedPolicy"
              required
              className="mt-0.5 h-4 w-4 accent-[#7cb342]"
            />
            <span>
              Согласен на обработку персональных данных и принимаю условия{' '}
              <a href="/privacy" className="underline underline-offset-2">
                политики конфиденциальности
              </a>
            </span>
          </label>
        </section>

        {state.error && (
          <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
        )}

        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
              Назад
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-accent" onClick={() => setStep((s) => s + 1)}>
              Продолжить
            </button>
          ) : (
            <button type="submit" className="btn btn-accent" disabled={pending}>
              {pending ? 'Отправляем…' : 'Зарегистрироваться'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
