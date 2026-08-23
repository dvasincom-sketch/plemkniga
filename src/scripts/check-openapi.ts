import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { buildOpenApi } from '@/lib/openapi'

/**
 * Проверка машинного описания API.
 *
 * ## Зачем проверять то, что и так собирается из конфигурации
 *
 * Именно потому, что собирается. Сборка молчалива: пропущенное поле,
 * не разрешившаяся ссылка, забытый раздел — всё это даёт валидный JSON,
 * который выглядит документацией и не является ею. Первая версия этого
 * генератора собирала все девяносто ручек и **не клала их в документ**:
 * `paths` считался и терялся в возвращаемом объекте. Файл отдавался,
 * Swagger UI открывался, и в нём не было ни одной ручки.
 *
 *   npm run check:openapi
 */

let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const payload = await getPayload({ config })
  const doc = buildOpenApi(payload, 'https://example.test') as Record<string, never>

  const paths = Object.keys((doc.paths ?? {}) as object)
  const schemas = Object.keys(((doc.components as never as { schemas: object })?.schemas ??
    {}) as object)

  console.log(`\nРучек: ${paths.length}, схем: ${schemas.length}\n`)

  check(doc.openapi === '3.1.0', 'версия формата — 3.1.0')
  check(paths.length > 0, 'ручки попали в документ')
  check(schemas.length > 0, 'схемы попали в документ')

  /*
   * Каждая коллекция, кроме служебных, обязана быть описана целиком:
   * схема, список и запись. Проверка идёт от конфигурации, а не от
   * списка имён в скрипте, — иначе новая коллекция появится в системе
   * и не появится в проверке.
   */
  const collections = (payload.config.collections as unknown as { slug: string }[])
    .map((c) => c.slug)
    .filter((slug) => !slug.startsWith('payload-'))

  const missing = collections.filter(
    (slug) =>
      !schemas.includes(slug) || !paths.includes(`/api/${slug}`) || !paths.includes(`/api/${slug}/{id}`),
  )
  check(missing.length === 0, `описаны все ${collections.length} коллекций`, missing.join(', '))

  const leaked = schemas.filter((s) => s.startsWith('payload-'))
  check(leaked.length === 0, 'служебные коллекции не описаны', leaked.join(', '))

  const refs = new Set<string>()
  JSON.stringify(doc).replace(/"\$ref":"#\/components\/schemas\/([^"]+)"/g, (m, name) => {
    refs.add(name)
    return m
  })
  const broken = [...refs].filter((r) => !schemas.includes(r))
  check(broken.length === 0, 'все ссылки на схемы разрешаются', broken.join(', '))

  console.log('\nРазметка формы против данных\n')

  const animals = (
    doc.components as never as { schemas: Record<string, { properties: Record<string, never> }> }
  ).schemas.animals.properties

  check(!('row' in animals) && !('tabs' in animals), 'разметка формы не попала в схему данных')
  check(Boolean(animals.identNumber), 'простое поле на месте')
  check(
    Boolean((animals.summary as never as { properties?: object })?.properties),
    'вложенная группа развёрнута',
  )
  check(
    (animals.pastOwners as never as { type?: string })?.type === 'array',
    'связь «многие» описана массивом',
  )
  check(
    Array.isArray((animals.state as never as { enum?: string[] })?.enum),
    'у списка перечислены допустимые значения',
  )
  check(Boolean(animals.id && animals.createdAt), 'служебные поля записи добавлены')

  console.log('\nВход и адрес\n')

  check(
    Boolean((doc.paths as never as Record<string, { post?: object }>)['/api/users/login']?.post),
    'вход описан — иначе спецификация показывает двери без ключа',
  )
  check(
    Boolean((doc.components as never as { securitySchemes?: { jwt?: object } })?.securitySchemes?.jwt),
    'способ авторизации описан',
  )
  check(
    (doc.servers as never as { url: string }[])[0]?.url === 'https://example.test',
    'адрес сервера подставляется снаружи',
  )

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
