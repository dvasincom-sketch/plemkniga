# ICAR ADE: техническая выжимка

Дата сверки: 2 сентября 2026 года.
Версия стандарта на момент сверки: **ADE 1.5.1** (последний релиз `v1.5.1`, ветка по умолчанию `ADE-1`).
Лицензия: **Apache 2.0** (файл `LICENSE` в корне репозитория).
Формат: JSON Schema 2020-12, OpenAPI 3.1. Проверено с OpenAPI Generator 7.9.0 и выше.

Все имена типов, полей и значений перечислений ниже приведены ровно так, как они записаны в репозитории `adewg/ICAR`, ветка `ADE-1`. Там, где чего-то в стандарте нет, это сказано прямо.

---

## 1. Устройство репозитория и версия

Репозиторий: https://github.com/adewg/ICAR

| Папка | Что лежит |
|---|---|
| `resources/` | Ресурсы — логические сущности, которые можно получить или отправить. Файлы вида `icarAnimalCoreResource.json`. Здесь же лежит `resourceTypeCatalog.md` — каталог допустимых значений дискриминатора `resourceType`. |
| `types/` | Вспомогательные типы данных (не самостоятельные ресурсы): идентификаторы, единицы измерения, метаданные. Файлы вида `icarAnimalIdentifierType.json`. |
| `enums/` | Перечисления. Файлы вида `icarAnimalSpecieType.json`, внутри `{"type": "string", "enum": [...]}`. |
| `collections/` | Обёртки-коллекции для пагинации. `icarResourceCollection.json` — база, остальные добавляют массив `member`. |
| `url-schemes/` | Спецификации OpenAPI 3.1 для location-centric API, разбитые по доменам. |
| `bundled-schemes/` | Сгенерированные (собранные redocly) варианты тех же схем, включая `combinedURLScheme.json` — единый файл со всеми ресурсами. Рекомендован как цель для кодогенерации. |
| `docs/` | Нормативная документация по двум API + пояснительные тексты. |
| `well-known/` | Реестры «хорошо известных» схем идентификаторов в markdown: `icarAnimalIdentifierType.md`, `icarBreedIdentifierType.md`, `icarLocationIdentifierType.md`, `icarTraitLabelIdentifierType.md`, `icarBVBaseIdentifierType.md`, `icarDiagnosisIdentifierType.md`, `icarReasonIdentifierType.md` и др. |
| `examples/` | Примеры сообщений. |
| `scripts/` | Скрипты сборки схем (`schema_bundle.sh` / `.ps1`). |

Три нормативные части стандарта, по README:
1. JSON Schema для типов данных (`resources/`, `types/`, `enums/`, `collections/`).
2. URL-схемы и OpenAPI для location-centric приложений (`url-schemes/` + `docs/location-based-api.md`).
3. Generic Data API для обмена данными (`docs/generic-data-exchange-api.md`).

Файлы `url-schemes/`: `exampleUrlScheme.json`, `feedURLscheme.json`, `healthURLScheme.json`, `managementURLScheme.json`, `milkURLScheme.json`, `performanceURLScheme.json`, `registrationURLScheme.json`, `reproductionURLScheme.json`, `sortingURLScheme.json`.

Ветки: `ADE-1` — текущий релиз (ветка по умолчанию, из неё клонируют). `Develop` — ветка для вкладов и PR.

Замечание про `docs/README.md`: там до сих пор написано «Current Version: ADE 1.3» — это не обновлено, ориентироваться нужно на `ReleaseNotes.md` и релизы.

---

## 2. Базовые типы

### `icarIdentifierType` (`types/icarIdentifierType.json`)

Фундамент всей системы идентификации. Всё в ADE идентифицируется парой «схема + id».

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `id` | string | **да** | Уникальный идентификатор ресурса, выданный в рамках схемы |
| `scheme` | string | **да** | Идентификатор схемы в обратной доменной нотации (reverse domain format), которая управляет уникальными идентификаторами |

Наследники через `allOf` (все имеют ровно те же два поля `id` + `scheme`):

- `icarAnimalIdentifierType` — животное
- `icarLocationIdentifierType` — локация / стадо / хозяйство
- `icarBreedIdentifierType` — порода
- `icarBVBaseIdentifierType` — база племенной ценности
- `icarCoatColorIdentifierType` — масть
- `icarTraitLabelIdentifierType` — признак (trait) системы записи
- `icarDiagnosisIdentifierType`, `icarMedicineIdentifierType`, `icarFeedIdentifierType`, `icarProductIdentifierType`, `icarPropertyIdentifierType`, `icarReasonIdentifierType`, `icarCarcassMetricIdentifierType`, `icarDeviceRegistrationIdentifierType`, `icarOrganizationIdentifierType`, `icarDeclarationIdentifierType`, `icarRationIdType`, `icarFeedRecommendationIdType`, `icarAnimalIdType`

Важно: **никакого отдельного `icarResourceType` в стандарте нет**. Базовый ресурс называется `icarResource`.

### `icarResource` (`resources/icarResource.json`)

Базовый класс любого ресурса. Все ресурсы подключают его через `allOf`.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `resourceType` | string | **да** | Дискриминатор. Короткое имя или URI логического типа ресурса. Допустимые значения — в `resources/resourceTypeCatalog.md` |
| `@self` | string | нет | URI самого ресурса (rel=self) |
| `meta` | `icarMetaDataType` | нет (но SHOULD) | Метаданные. Обязательны, если нужна синхронизация. Рабочая группа планирует сделать `meta` обязательным в следующем мажорном релизе |
| `location` | `icarLocationIdentifierType` | нет | Уникальная пара scheme + id локации |

`discriminator.propertyName = "resourceType"`.

### `icarMetaDataType` (`types/icarMetaDataType.json`)

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `source` | string | **да** | Источник данных. URI или reverse DNS системы-источника |
| `sourceId` | string | нет (но SHOULD) | Уникальный id ресурса в системе-источнике (UUID, IRI, URI или составной). Планируется сделать обязательным в 2.0 |
| `isDeleted` | boolean | нет | Признак того, что ресурс удалён в системе-источнике |
| `modified` | `icarDateTimeType` | **да** | RFC3339 UTC дата/время последнего изменения |
| `created` | `icarDateTimeType` \| null | нет | RFC3339 UTC дата/время создания |
| `creator` | string | нет | Человек или организация, создавшая объект |
| `validFrom` | `icarDateTimeType` \| null | нет | RFC3339 UTC начало периода валидности |
| `validTo` | `icarDateTimeType` \| null | нет | RFC3339 UTC конец периода валидности |

### `icarDateTimeType` / `icarDateType`

`icarDateTimeType`: `{"type": "string", "format": "date-time"}`. Точка во времени. **Должно быть в UTC с суффиксом `Z`, по RFC3339.**
`icarDateType`: аналогично, только дата.

### `icarEventCoreResource` (`resources/icarEventCoreResource.json`)

Наследует `icarResource`. Это то, что наследуют **все** события.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `id` | string | нет | Уникальный идентификатор события в системе-источнике |
| `eventDateTime` | `icarDateTimeType` | нет | RFC3339 UTC дата и время события |
| `traitLabel` | `icarTraitLabelIdentifierType` | нет | Если событие представляет формальный признак — система записи и код признака |
| `responsible` | string | нет | Кто вручную записал или санкционировал событие. SHOULD быть объектом person |
| `contemporaryGroup` | string | нет | Код группы-сверстниц для статистического анализа |
| `remark` | string | нет | Свободный комментарий |

Плюс унаследованные от `icarResource`: `resourceType` (обязательное), `@self`, `meta`, `location`.

### `icarAnimalEventCoreResource` (`resources/icarAnimalEventCoreResource.json`)

Наследует `icarEventCoreResource`, добавляет одно поле:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `animal` | `icarAnimalIdentifierType` | **да** | Пара scheme + id животного |

Почти все индивидуальные события животных наследуют именно этот класс.

Для групповых событий есть параллельная ветка `icarGroupEventCoreResource`.

---

## 3. Схемы идентификаторов (`scheme`)

### Правила именования

Из вики «Schemes»:

- Схема должна быть **человекочитаемой даже в URL-кодированном виде**. Поэтому в имени схемы **не должно быть `:` и `/`** и прочих спецсимволов.
- Рекомендуется **обратная доменная нотация** (как в пакетах Java/Android), потому что она естественно группирует схемы одной организации или страны. Пример из вики: `org.icar.id`.
- Формат самого `id` определяется организацией-владельцем схемы. В ADE и `id`, и `value` — просто `string`, никаких дополнительных ограничений стандарт не накладывает.
- Реестр в вики и в `well-known/` — **информативный**, а не нормативный: использовать можно любую схему. Но при добавлении новой рекомендуется соблюдать четыре принципа: идентификатор широко известен в отрасли/регионе, уникален среди всех сторон, имеет ограниченный набор авторитетных источников, соотносим с юридическим лицом-владельцем актива.

Важно: вида `iso.org:11784` или `icar.org/animalId` в стандарте **нет** — двоеточия и слэши как раз запрещены рекомендацией.

### `well-known/icarAnimalIdentifierType.md` — схемы животных

| Short URI (scheme) | Описание | Пример |
|---|---|---|
| `eu.animalId` | Общеевропейская идентификация по ISO 11784, первые три десятичные цифры — числовой код страны ISO 3166-1 | `276000312312345` |
| `eu.bovine` | Общеевропейская идентификация КРС с префиксом ISO 3166 alpha-2 | `NL 6802 5082 9` |
| `icar.Interbull` | Идентификаторы животных, признанные Interbull | — |
| `nz.digad.birthid` | New Zealand dairy Birth Id | `ABCD-21-1234` |
| `nz.nait.visualid` | Визуальный идентификатор NZ (мясной скот, олени) | `123456-12-1234` |
| `std.iso.11785` | RFID-код по ISO 11785, десятичное представление, первые 3 цифры — код страны или производителя | `276000312312345` |
| `usa.ain` | United States Animal Identification Number | `840003123456789` или `USA0003123456789` |
| `us.bovine` | US Lifetime Herdbook number | `US 123456789` |
| `uk.cts.eartag` | Британская идентификация КРС | `UK230011200123` |
| `au.nlis` | Австралийская NLIS — визуальный код на бирке | `QABC1234XBC2345` |
| `dk.animalnumber` | Датский официальный пожизненный номер | `1234501234` |
| `dk.herdbooknumber` | Датский официальный номер племенной книги для быков | `12345` |
| `ca.bovine` | Канадский диапазон RFID для КРС (ISO 11784) | `124000123456789` |
| `ca.bison`, `ca.ovine`, `ca.porcine`, `ca.caprine` | Канадские диапазоны RFID по видам | — |
| `ca.lactanet` | Идентификатор ISO 11784 в системе DairyTrace | `124000123456789` |
| `ca.animalnumber` | Канадский RFID; при отсутствии — регистрационный номер (до 12 цифр) | `124000123456789` |
| `composite.withinherdid` | Используется там, где нет национальной схемы: составной ID из идентификатора стада и животного через точку | `"123456.2516"` |

### `well-known/icarLocationIdentifierType.md` — схемы локаций

`uk.cph`, `au.nlis.pic`, `uk.mro.herdid`, `nz.dairy.herd.participantcode`, `dk.herdnumber`, `ca.herdnumber`.

Из вики дополнительно (информативно, устаревающий список): `eu.farmId`, `de.vitFarmId`, `nl.ubn`, `nl.brs`, `be.pen`, `org.gs1.gln`, `au.gov.ag.pic`.

### `well-known/icarBreedIdentifierType.md` — схемы пород

| Short URI | Описание | Пример |
|---|---|---|
| `icar.breed-2` | Двухсимвольные коды пород ICAR | `AY` |
| `icar.breed-3` | Трёхсимвольные коды пород ICAR | `RDC` |
| `uk.cts.breed` | Список пород UK Cattle Tracing System | `Aberdeen Angus` |

Справочник кодов: https://interbull.org/ib/icarbreedcodes

### `well-known/icarTraitLabelIdentifierType.md` — схемы признаков

| Short URI | Описание | Пример |
|---|---|---|
| `icar.idea` | ICAR IDEA Trait Codes | `mil` |

Справочник: https://interbull.org/ib/idea_trait_codes

### `well-known/icarBVBaseIdentifierType.md` — базы племенной ценности

Файл существует, но **таблица в нём пустая**: ни одна схема базы племенной ценности пока не зарегистрирована.

### `enums/icarAnimalIdSchemeCode.json`

Единственный enum со схемами. Значений всего четыре и они про локации/хозяйства, а не про животных:

```
"nl.ubn", "be.pen", "gb.rpa", "ni.daera"
```

Этот enum практически не используется — в ресурсах везде идёт свободная строка `scheme`.

---

## 4. Ресурсы

Общее правило чтения таблиц ниже: у каждого ресурса кроме своих полей есть унаследованные от `icarResource` (`resourceType` обязательное, `@self`, `meta`, `location`), а у событий — ещё и поля `icarEventCoreResource` / `icarAnimalEventCoreResource`.

### 4.1 `icarAnimalBaseResource`

Введён в 1.5.1. Общая база для животного и для потомка при отёле. Наследует `icarResource`.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `alternativeIdentifiers` | array of `icarAnimalIdentifierType` | нет | Альтернативные идентификаторы, в том числе временные — транспондеры, номера животных |
| `specie` | `icarAnimalSpecieType` | **да** | Вид животного |
| `gender` | `icarAnimalGenderType` | **да** | Пол животного |
| `birthDate` | `icarDateTimeType` | нет | RFC3339 UTC дата/время рождения |
| `primaryBreed` | `icarBreedIdentifierType` | нет | Код породы ICAR (scheme + id) |
| `breedFractions` | `icarBreedFractionsType` | нет | Кровность по породам |
| `coatColor` | string | нет | Масть, в соглашениях данной породы |
| `coatColorIdentifier` | `icarCoatColorIdentifierType` | нет | Масть по национальной или породной схеме (scheme + id) |
| `managementTag` | string | нет | Идентификатор, которым фермер пользуется в повседневной работе. Часто — номер животного |
| `name` | string | нет | Кличка, данная фермером |
| `officialName` | string | нет | Официальное имя в племенной книге |
| `productionPurpose` | `icarProductionPurposeType` | нет | Основное направление продуктивности |
| `parentage` | array of `icarParentageType` | нет | Родители. Массив выдерживает несколько поколений: можно указать родителя родителя |
| `healthStatus` | `icarAnimalHealthStatusType` | нет | Статус здоровья |

Внимание: поле называется **`healthStatus`** (единственное число, скаляр), а не `healthStatuses`. Массива статусов здоровья в ресурсе животного нет.

### 4.2 `icarAnimalCoreResource`

Наследует `icarAnimalBaseResource`. Дискриминатор `resourceType = "icarAnimalCoreResource"`.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `identifier` | `icarAnimalIdentifierType` | **да** | Основная пара scheme + id животного |
| `status` | `icarAnimalStatusType` | нет | Статус на ферме: жив, мёртв, выбыл |
| `lactationStatus` | `icarAnimalLactationStatusType` | нет | Статус лактации |
| `reproductionStatus` | `icarAnimalReproductionStatusType` | нет | Репродуктивный статус |

Плюс все поля `icarAnimalBaseResource` и `icarResource`. Полный набор обязательных полей: `resourceType`, `identifier`, `specie`, `gender`.

Коллекция: `icarAnimalCoreCollection` (`view` + `member: array of icarAnimalCoreResource`).

### 4.3 `icarParentageType` (родословная)

Отдельного ресурса `icarParentageEvent` или типа `icarAnimalParentageType` в стандарте **нет**. Родословная передаётся массивом `parentage` внутри ресурса животного.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `parentOf` | `icarAnimalIdentifierType` | **да** | Ссылка на потомка этого родителя — так строятся многопоколенные родословные |
| `gender` | `icarAnimalGenderType` | **да** | Male или Female, чтобы отличить отца от матери |
| `relation` | `icarAnimalRelationType` | нет | Тип родства: `Genetic` (по умолчанию), `Recipient`, `Adoptive` |
| `identifier` | `icarAnimalIdentifierType` | **да** | Пара scheme + id родителя |
| `officialName` | string | нет | Официальное имя в племенной книге |

### 4.4 `icarBreedFractionsType` (кровность)

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `denominator` | integer | **да** | Знаменатель долей: 16, 64, 100 |
| `fractions` | array | нет | Массив объектов `{breed: icarBreedIdentifierType, fraction: number (double)}` |

### 4.5 `icarAnimalSetResource`

Наследует `icarResource`.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `id` | string | **да** | Уникальный идентификатор набора в системе-источнике |
| `name` | string | нет | Человекочитаемое имя набора |
| `reference` | string | нет | Произвольная ссылка для синхронизации систем или отображения пользователю |
| `purpose` | `icarSetPurposeType` | нет | Назначение набора |
| `member` | array of `icarAnimalIdentifierType` | **да** | Животные в наборе. Имя `member` — из синтаксиса JSON-LD Hydra |

Сопутствующие события: `icarAnimalSetJoinEventResource`, `icarAnimalSetLeaveEventResource`.

### 4.6 `icarTestDayResultEventResource` (контрольное доение)

Наследует `icarAnimalEventCoreResource`. Все собственные поля **необязательные**.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `milkWeight24Hours` | `icarMilkingMilkWeightType` | нет | Удой за 24 часа |
| `testDayCode` | `icarTestDayCodeType` | нет | Код состояния коровы в контрольный день |
| `milkCharacteristics` | array of `icarMilkCharacteristicsType` | нет | Показатели молока: жир, белок, соматика и прочее |
| `predictedProductionOnTestDay` | `icarMilkingPredictionType` | нет | Прогноз продуктивности на контрольный день |

`icarMilkingMilkWeightType`:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `unitCode` | string, enum `["KGM"]` | **да** | Код единицы UN/CEFACT. Допустим только KGM |
| `value` | number (double) | **да** | Значение |

`icarMilkCharacteristicsType` — вот здесь и живут жир, белок, соматика:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `characteristic` | string | **да** | Трактовать как enum, список и единицы — в `enums/icarMilkCharacteristicCodeType.json` |
| `value` | string | **да** | Значение показателя. Именно строка, не число |
| `unit` | string | нет | Единица UN/CEFACT. Переопределять только если единицы отличаются от дефолтных |
| `measuringDevice` | string | нет | Класс измерительного устройства |

`icarTestDayResource` (сам контрольный день, не результат по животному):

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `id` | string | **да** | Уникальный идентификатор контрольного дня |
| `beginDate` | `icarDateTimeType` | **да** | RFC3339 UTC начало отбора проб молока |
| `endDate` | `icarDateTimeType` | **да** | RFC3339 UTC конец отбора проб |

Сводка по лактации — `icarLactationResource`:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `id` | string | **да** | Идентификатор лактации |
| `animal` | `icarAnimalIdentifierType` | **да** | Животное |
| `beginDate` | `icarDateTimeType` | нет | Начало лактации |
| `endDate` | `icarDateTimeType` | нет | Конец лактации: запуск, гибель или следующий отёл |
| `parity` | number | нет | Номер лактации |
| `lactationLength` | number | нет | Длина лактации на текущий момент |
| `milkAmount` | `icarTraitAmountType` | нет | Удой за лактацию |
| `fatAmount` | `icarTraitAmountType` | нет | Количество жира |
| `proteinAmount` | `icarTraitAmountType` | нет | Количество белка |
| `lactosisAmount` | `icarTraitAmountType` | нет | Количество лактозы (в схеме так и написано `lactosisAmount`) |
| `lastTestDay` | `icarDateTimeType` | нет | Дата последнего контрольного дня |
| `lactationType` | `icarLactationType` | нет | Тип лактации по длине |
| `milkRecordingMethod` | `icarMilkRecordingMethodType` | нет | Метод молочного контроля |

`icarTraitAmountType`: `unitCode` (enum `["KGM", "LBR"]`, обязательное) + `value` (number double, обязательное).

`icarMilkRecordingMethodType` (все поля необязательные): `milkRecordingProtocol`, `milkRecordingScheme`, `milkingsPerDay`, `milkSamplingScheme`, `recordingInterval` (number, дней), `milkSamplingMoment`, `icarCertified` (boolean — сертифицирована ли информация ICAR), `milkingType`.

### 4.7 `icarReproParturitionEventResource` (отёл)

Наследует `icarAnimalEventCoreResource`. Все собственные поля необязательные.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `isEmbryoImplant` | boolean | нет | Потомок получен трансплантацией эмбриона |
| `damParity` | integer | нет | Номер отёла (опороса, окота) матери |
| `liveProgeny` | integer | нет | Число живых потомков. Важно, если потомки не идентифицированы |
| `totalProgeny` | integer | нет | Общее число потомков, включая мертворождённых |
| `calvingEase` | `icarReproCalvingEaseType` | нет | Лёгкость отёла, соответствует традиционным значениям 1–5 |
| `progenyDetails` | array of `icarProgenyDetailsResource` \| null | нет | Список потомков. Рекомендуется указывать как минимум пол и статус |
| `progeny` | array of `icarAnimalCoreResource` \| null | нет, **deprecated** | Устаревшее. Использовать `progenyDetails` |

`icarProgenyDetailsResource` (наследует `icarAnimalBaseResource`, то есть у потомка доступны `specie`, `gender`, `birthDate`, `primaryBreed`, `parentage` и т. д.):

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `identifier` | `icarAnimalIdentifierType` | нет | Идентификатор потомка |
| `taggingDate` | `icarDateTimeType` \| null | нет | Дата биркования |
| `birthStatus` | `icarParturitionBirthStatusType` \| null | нет | Статус при рождении |
| `birthSize` | `icarParturitionBirthSizeType` \| null | нет | Размер при рождении |
| `birthWeight` | `icarMassMeasureType` \| null | нет | Вес при рождении |

### 4.8 `icarReproInseminationEventResource` (осеменение)

Наследует `icarAnimalEventCoreResource`.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `rank` | integer | нет | Порядковый номер осеменения в рамках одного полового цикла |
| `inseminationType` | `icarReproInseminationType` | **да** | Тип осеменения |
| `sireIdentifiers` | array of `icarAnimalIdentifierType` | нет | Идентификаторы быка, включая официальный ID и племенную книгу |
| `sireOfficialName` | string | нет | Официальное имя быка в племенной книге |
| `sireURI` | string | нет | URI на `icarAnimalCoreResource` быка |
| `straw` | `icarReproSemenStrawResource` | нет | Данные соломинки, могут включать и данные быка |
| `eventEndDateTime` | `icarDateTimeType` | нет | Для вольной случки — окончание периода |
| `semenFromFarmStocks` | boolean | нет | Семя из собственных запасов фермера (false — предоставлено техником) |
| `farmContainer` | string | нет | Номер или ID сосуда, из которого взята доза |
| `embryo` | `icarReproEmbryoResource` | нет | Данные эмбриона |
| `doItYourself` | boolean | нет | Только при `inseminationType = Insemination`: true, если осеменял сам фермер |

### 4.9 `icarReproPregnancyCheckEventResource` (проверка стельности)

Наследует `icarAnimalEventCoreResource`. Все собственные поля необязательные.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `method` | `icarReproPregnancyMethodType` | нет | Метод диагностики |
| `result` | `icarReproPregnancyResultType` | нет | Результат |
| `foetalAge` | integer | нет | Возраст плода или длительность стельности, дней |
| `foetusCount` | integer | нет | Количество наблюдаемых плодов |
| `foetusCountMale` | integer | нет | Из них мужского пола |
| `foetusCountFemale` | integer | нет | Из них женского пола |
| `exceptions` | array of string | нет | Дополнительные локальные наблюдения, например `ABNORMAL CALF` |

### 4.10 `icarConformationScoreEventResource` (оценка экстерьера)

Устроен как `allOf` из `icarAnimalEventCoreResource` и `icarConformationScoreType`. То есть событие — это **одна оценка одного признака**.

`icarConformationScoreType`:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `traitGroup` | `icarConformationTraitGroupType` | нет | Composite или Linear |
| `score` | number | **да** | Оценка. Для линейных признаков 1–9, для комплексных обычно 50–99 |
| `traitScored` | `icarConformationTraitType` | **да** | Оцениваемый признак по руководству ICAR (ICAR Guidelines, раздел 5 Conformation Recording) |
| `method` | `icarConformationScoringMethodType` | нет | Manual или Automated |
| `device` | `icarDeviceReferenceType` | нет | Устройство при автоматической оценке |

`icarTypeClassificationEventResource` — событие для набора оценок сразу:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `conformationScores` | array of `icarConformationScoreType` | нет | Набор оценок экстерьера |

В файле `icarTypeClassificationEventResource.json` в блоке `required` перечислены `score` и `traitScored` — это, судя по всему, ошибка копирования из `icarConformationScoreType`, потому что таких полей у этого ресурса нет. Учитывать при валидации.

### 4.11 Движение и выбытие

**Именование:** отдельных `icarDeathEvent`, `icarArrivalEvent`, `icarDepartureEvent` нет. Правильные имена — `icarMovementDeathEventResource`, `icarMovementArrivalEventResource`, `icarMovementDepartureEventResource`, `icarMovementBirthEventResource`. Есть и групповые варианты с префиксом `icarGroupMovement...`.

`icarMovementBirthEventResource` (наследует `icarAnimalEventCoreResource`, `location` **обязательно**):

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `registrationReason` | `icarRegistrationReasonType` | нет | Это рождение или регистрация |
| `animalDetail` | `icarAnimalCoreResource` | нет | Данные животного, если оно ещё не заведено в хозяйстве |

`icarMovementArrivalEventResource`:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `arrivalReason` | `icarArrivalReasonType` | нет | Причина поступления |
| `animalDetail` | `icarAnimalCoreResource` | нет | Данные животного, если оно ещё не заведено |
| `animalState` | `icarAnimalStateType` | нет | Состояние животного |
| `consignment` | `icarConsignmentType` | нет | Партия поставки |

`icarAnimalStateType`: `currentLactationParity` (number), `lastCalvingDate`, `lastInseminationDate`, `lastDryingOffDate` (все `icarDateType`), все необязательные.

`icarMovementDepartureEventResource`:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `departureKind` | `icarDepartureKindType` | нет | Вид выбытия / тип назначения |
| `departureReason` | `icarDepartureReasonType` | нет | Причина выбытия |
| `consignment` | `icarConsignmentType` | нет | Партия отгрузки |
| `extendedReasons` | array of `icarReasonIdentifierType` | нет | Расширенные коды причин выбытия (scheme + id) |

`icarMovementDeathEventResource`:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `deathReason` | `icarDeathReasonType` | нет | Кодированная причина гибели |
| `explanation` | string | нет | Свободное пояснение причины |
| `disposalMethod` | `icarDeathDisposalMethodType` | нет | Способ утилизации |
| `disposalOperator` | string | нет | Официальное название организации-утилизатора |
| `disposalReference` | string | нет | Ссылка (квитанция, накладная, ID) на утилизацию |
| `consignment` | `icarConsignmentType` | нет | Партия вывоза |
| `deathMethod` | `icarDeathMethodType` | нет | Способ гибели: несчастный случай, естественные причины, эвтаназия |
| `extendedReasons` | array of `icarReasonIdentifierType` | нет | Расширенные коды причин гибели |

### 4.12 `icarWeightEventResource` (взвешивание)

Наследует `icarAnimalEventCoreResource`. Все собственные поля необязательные.

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `weight` | `icarMassMeasureType` | нет | Измерение веса с единицами и разрешением |
| `device` | `icarDeviceReferenceType` | нет | Устройство |
| `timeOffFeed` | number | нет | Часов голодной выдержки перед взвешиванием, для стандартизации наполнения ЖКТ |

`icarMassMeasureType` (все поля необязательные):

| Поле | Тип | Что означает |
|---|---|---|
| `measurement` | number, minimum 0 | Значение веса в указанных единицах, обычно кг |
| `units` | `uncefactMassUnitsType` | Трёхбуквенный код UN/CEFACT. По умолчанию KGM |
| `method` | `icarWeightMethodType` | Метод. По умолчанию LoadCell |
| `resolution` | number | Наименьшая различимая разница измерения, в тех же единицах, например 0.5 |

Групповой вариант — `icarGroupWeightEventResource`.

### 4.13 `icarBreedingValueResource` (племенная ценность)

**Ресурс существует.** Наследует `icarResource` напрямую (это не событие).

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `id` | string | **да** | Уникальный идентификатор в системе-источнике |
| `animal` | `icarAnimalIdentifierType` | **да** | Животное |
| `base` | `icarBVBaseIdentifierType` | нет | Схема и id базы, относительно которой рассчитана племенная ценность |
| `version` | string | нет | Версия расчёта: дата, имя версии или что угодно, чем центр расчёта различает свои прогоны |
| `breedingValues` | array of `icarBreedingValueType` | нет | Собственно значения |

`icarBreedingValueType` (все поля необязательные):

| Поле | Тип | Что означает |
|---|---|---|
| `traitLabel` | `icarTraitLabelIdentifierType` | Схема и id признака, для которого рассчитана племенная ценность |
| `calculationType` | `icarBreedingValueCalculationType` | Метод расчёта |
| `value` | number | Значение племенной ценности |
| `reliability` | number | Достоверность |
| `resolution` | number | Наименьшая значимая разница, для корректного отображения |

Коллекция: `icarBreedingValueCollection`. Endpoint: только **GET** `/locations/{location-scheme}/{location-id}/breeding-values` — POST не предусмотрен.

### 4.14 Генотипирование и генетические образцы

**Ничего этого в стандарте нет.** В `resources/` нет ни `icarGeneticSampleEvent`, ни любого другого ресурса про отбор проб на ДНК, генотипы, SNP-чипы или результаты генотипирования. Единственная точка соприкосновения с геномикой — значение `GenomicBreedingValue` в перечислении `icarBreedingValueCalculationType`, то есть можно передать уже посчитанную геномную племенную ценность, но не исходные генетические данные.

### 4.15 Полный перечень ресурсов

Файлы в `resources/` (ADE 1.5.1):

`exampleErrorResource`, `icarAnimalBaseResource`, `icarAnimalCoreResource`, `icarAnimalEventCoreResource`, `icarAnimalSetJoinEventResource`, `icarAnimalSetLeaveEventResource`, `icarAnimalSetResource`, `icarAnimalSortingCommandResource`, `icarAttentionEventResource`, `icarBatchResult`, `icarBreedingValueResource`, `icarCarcassObservationsEventResource`, `icarCarcassResource`, `icarConformationScoreEventResource`, `icarDailyMilkingAveragesResource`, `icarDeviceResource`, `icarDiagnosisEventResource`, `icarEventCoreResource`, `icarFeedIntakeEventResource`, `icarFeedRecommendationResource`, `icarFeedReportResource`, `icarFeedResource`, `icarFeedStorageResource`, `icarFeedTransactionResource`, `icarGestationResource`, `icarGroupEventCoreResource`, `icarGroupFeedingEventResource`, `icarGroupMovementArrivalEventResource`, `icarGroupMovementBirthEventResource`, `icarGroupMovementDeathEventResource`, `icarGroupMovementDepartureEventResource`, `icarGroupPositionObservationEventResource`, `icarGroupTreatmentEventResource`, `icarGroupWeightEventResource`, `icarHealthStatusObservedEventResource`, `icarInventoryTransactionResource`, `icarLactationResource`, `icarLactationStatusObservedEventResource`, `icarLocationResource`, `icarMedicineResource`, `icarMedicineTransactionResource`, `icarMilkPredictionResource`, `icarMilkingDryOffEventResource`, `icarMilkingVisitEventResource`, `icarMovementArrivalEventResource`, `icarMovementBirthEventResource`, `icarMovementDeathEventResource`, `icarMovementDepartureEventResource`, `icarObservationSummaryResource`, `icarPositionObservationEventResource`, `icarProcessingLotResource`, `icarProgenyDetailsResource`, `icarRationResource`, `icarRemarkEventResource`, `icarReproAbortionEventResource`, `icarReproDoNotBreedEventResource`, `icarReproEmbryoFlushingEventResource`, `icarReproEmbryoResource`, `icarReproHeatEventResource`, `icarReproInseminationEventResource`, `icarReproMatingRecommendationResource`, `icarReproParturitionEventResource`, `icarReproPregnancyCheckEventResource`, `icarReproSemenStrawResource`, `icarReproStatusObservedEventResource`, `icarResource`, `icarResourceCollectionReference`, `icarResponseMessageResource`, `icarSchemeTypeResource`, `icarSchemeValueResource`, `icarSortingSiteResource`, `icarStatisticsResource`, `icarTestDayResource`, `icarTestDayResultEventResource`, `icarTreatmentEventResource`, `icarTreatmentProgramEventResource`, `icarTypeClassificationEventResource`, `icarWeightEventResource`, `icarWithdrawalEventResource`.

Дискриминаторы `resourceType` — в `resources/resourceTypeCatalog.md`. CURIE-префикс `icar` разворачивается в `http://data.adewg.icar.org/core/`. В каталоге есть две опечатки, которые не совпадают с именами файлов: `icarReproInsemonationEventResource` (файл — `icarReproInseminationEventResource.json`) и `icarTestDayResultResource` (файл — `icarTestDayResultEventResource.json`).

---

## 5. Ключевые перечисления

Фактические списки значений (ADE 1.5.1).

### `icarAnimalSpecieType`
```
Buffalo, Cattle, Deer, Elk, Goat, Horse, Pig, Sheep
```

### `icarAnimalGenderType`
```
Female, FemaleNeuter, Freemartin, Male, MaleCryptorchid, MaleNeuter, Unknown
```

### `icarAnimalHealthStatusType`
```
Healthy, Suspicious, Ill, InTreatment, ToBeCulled
```

### `icarAnimalReproductionStatusType`
```
Open, Inseminated, Pregnant, NotPregnant, Birthed, DoNotBreed, PregnantMultipleFoetus
```

### `icarAnimalLactationStatusType`
```
Dry, Lead, Fresh, Early, Lactating
```

### `icarAnimalStatusType`
```
Alive, Dead, OffFarm, Unknown
```

### `icarProductionPurposeType`
```
Meat, Milk, Wool, Suckler, Breeding, Research, Pet
```
Пояснения из схемы: Meat соответствует UNSPC 50111500, Milk — UNSPC 50203200, Wool — UNSPC 11131506. Suckler — для выпойки телят. Breeding — быки для производства семени.

### `icarAnimalRelationType`
```
Genetic, Recipient, Adoptive
```

### `icarParturitionBirthStatusType`
```
Alive, Stillborn, Aborted, DiedBeforeTaggingDate, DiedAfterTaggingDate, SlaughteredAtBirth, EuthanisedAtBirth
```

### `icarReproCalvingEaseType`
```
EasyUnassisted, EasyAssisted, DifficultExtraAssistance, DifficultVeterinaryCare, CaesareanOrSurgery
```
В указанном порядке соответствуют кодам INTERBEEF 1–5.

### `icarReproInseminationType`
```
NaturalService, RunWithBull, Insemination, Implantation
```

### `icarReproPregnancyMethodType`
```
Echography, Palpation, Blood, Milk, Visual, Other
```

### `icarReproPregnancyResultType`
```
Empty, Pregnant, Multiple, Unknown
```

### `icarReproEmbryoFlushingMethodType`
```
OPU-IVF, Superovulation
```

### `icarMilkCharacteristicCodeType`

Внимание: в задании этот enum назван `icarMilkingMilkCharacteristicCode` — такого файла нет. Правильное имя — **`icarMilkCharacteristicCodeType`**. Отдельно в `enums/` есть ещё `icarMilkCharacteristicCodeType` и `icarMilkingType`, `icarMilkingTypeCode`, `icarMilkingRemarksType` — не путать.

```
SCC, FAT, PROTEIN, LAC, UREA, BLOOD, ACETONE, BHB, LDH, PRO,
AVGCOND, MAXCOND, AVGFLWR, MAXFLWR, WEIGHT, TEMPERATURE
```

Единицы, предписанные описанием схемы (третья колонка — код UN/CEFACT):

| Код | Показатель | Единица | UN/CEFACT |
|---|---|---|---|
| `SCC` | Somatic cell count (соматика) | ×1000 клеток/мл | NCL |
| `FAT` | Fat (жир) | % | VP |
| `PROTEIN` | Protein (белок) | % | VP |
| `LAC` | Lactose | % | VP |
| `UREA` | Urea | мг/л | M1 |
| `BLOOD` | Blood | true/false | A99 |
| `ACETONE` | Acetone | ммоль/л | M33 |
| `BHB` | Beta hydroxybutyrate | ммоль/л | M33 |
| `LDH` | Lactate dehydrogenase | МЕ/л | — |
| `PRO` | Progesteron | ммоль/л | M33 |
| `AVGCOND` | Средняя электропроводность молока при 25 °C | мСм/см | H61 |
| `MAXCOND` | Максимальная электропроводность при 25 °C | мСм/см | H61 |
| `AVGFLWR` | Средняя скорость молокоотдачи | кг/мин | F31 |
| `MAXFLWR` | Максимальная скорость молокоотдачи | кг/мин | F31 |
| `WEIGHT` | Вес животного | кг | KGM |
| `PAG` | Pregnancy associated glycoprotein | ммоль/л | M33 |

Расхождение в самой схеме: `PAG` описан в тексте описания, но **отсутствует** в массиве `enum`; `TEMPERATURE` присутствует в `enum`, но не описан в тексте и не имеет предписанной единицы.

### `icarTestDayCodeType`
```
Dry, SamplingImpossible, Sick
```

### `icarLactationType`
```
Normal, 100Days, 200Days, 305Days, 365Days
```

### `icarConformationTraitGroupType`
```
Composite, Linear
```

### `icarConformationScoringMethodType`
```
Manual, Automated
```

### `icarConformationTraitType`
```
Angularity, BackLength, BackWidth, BodyConditionScore, BodyDepth, BodyLength,
BoneStructure, CentralLigament, ChestDepth, ChestWidth, ClawAngle, DairyStrength,
FeetLegs, FinalScore, FlankDepth, FootAngle, ForePasternsSideView, ForeUdderAttachment,
ForeUdderLength, Frame, FrontFeetOrientation, FrontLegsFrontView, FrontTeatPlacement,
HeightAtRump, HeightAtWithers, HindPasternsSideView, HockDevelopment, LengthOfRump,
Locomotion, LoinStrength, Muscularity, MuscularityComposite, MuscularityShoulderSideView,
MuscularityShoulderTopView, MuzzleWidth, RearLegsRearView, RearLegsSet, RearLegsSideView,
RearTeatPlacement, RearUdderHeight, RearUdderWidth, RoundingOfRibs, RumpAngle, RumpLength,
RumpWidth, SkinThickness, Stature, TailSet, TeatDirection, TeatForm, TeatLength,
TeatPlacementRearView, TeatPlacementSideView, TeatThickness, ThicknessOfBone,
ThicknessOfTeat, ThicknessOfLoin, ThighLength, ThighRoundingSideView, ThighWidthRearView,
ThurlWidth, TopLine, Type, Udder, UdderBalance, UdderDepth, WidthAtHips, WidthAtPins
```

### `icarBreedingValueCalculationType`
```
BreedingValue, ParentAverageBreedingValue, GenomicBreedingValue, ConvertedBreedingValue, Other
```

### `icarArrivalReasonType`
```
Purchase, InternalTransfer, Imported, StudService, StudServiceReturn, Slaughter,
Agistment, AgistmentReturn, Show, ShowReturn, Sale, SaleReturn, Other
```

### `icarDepartureKindType`
```
InternalTransfer, Export, Slaughter, Newborn, StudService, StudServiceReturn,
Agistment, AgistmentReturn, Show, ShowReturn, Sale, SaleReturn, Other
```

### `icarDepartureReasonType`
```
Age, Superfluous, Slaughter, Sale, Newborn, LegOrClaw, Nutrition, Parturition,
Mastitis, Fertility, Health, Production, MilkingAbility, BadType, Behaviour, Other, Unknown
```

### `icarDeathReasonType`
```
Missing, Parturition, Disease, Accident, Consumption, Culled, Other, Unknown,
Age, Mastitis, Production, LegOrClaw, MilkingAbility, Nutrition, Fertility
```

### `icarWeightMethodType`
```
LoadCell, Girth, Assessed, WalkOver, Predicted, Imaged, FrontEndCorrelated, GroupAverage
```

### `icarSetPurposeType`
```
Enclosure, Feeding, Finishing, Growing, Health, Lactation, Movement, Rearing,
Reproduction, Session, Other
```

### `icarBreedCode`

**Такого перечисления в стандарте нет.** Породы кодируются не enum-ом, а типом `icarBreedIdentifierType` (пара scheme + id). Официальные списки кодов ICAR ведутся Interbull (https://interbull.org/ib/icarbreedcodes) и подключаются через схемы `icar.breed-2` / `icar.breed-3`.

### Полный список файлов `enums/`

`icarAggregationType`, `icarAnimalGenderType`, `icarAnimalHealthStatusType`, `icarAnimalIdSchemeCode`, `icarAnimalLactationStatusType`, `icarAnimalRelationType`, `icarAnimalReproductionStatusType`, `icarAnimalSpecieType`, `icarAnimalStatusType`, `icarArrivalReasonType`, `icarAttentionCategoryType`, `icarAttentionCauseType`, `icarAttentionPriorityType`, `icarBatchResultSeverityType`, `icarBottleIdentifierType`, `icarBreedingValueCalculationType`, `icarCarcassPrimalType`, `icarCarcassSideType`, `icarCarcassStateType`, `icarChainProcessType`, `icarConformationScoringMethodType`, `icarConformationTraitGroupType`, `icarConformationTraitType`, `icarDeathDisposalMethodType`, `icarDeathMethodType`, `icarDeathReasonType`, `icarDepartureKindType`, `icarDepartureReasonType`, `icarDiagnosisSeverityType`, `icarDiagnosisStageType`, `icarDurationType`, `icarFeedCategoryType`, `icarGroupEventMethodType`, `icarGroupType`, `icarInventoryTransactionKindType`, `icarLactationType`, `icarMessageType`, `icarMethodType`, `icarMilkCharacteristicCodeType`, `icarMilkRecordingProtocolType`, `icarMilkRecordingSchemeType`, `icarMilkSamplingMomentType`, `icarMilkSamplingSchemeType`, `icarMilkingRemarksType`, `icarMilkingType`, `icarMilkingTypeCode`, `icarMilkingsPerDayType`, `icarObservationStatusType`, `icarParturitionBirthSizeType`, `icarParturitionBirthStatusType`, `icarPositionOnAnimalType`, `icarProductFamilyType`, `icarProductionPurposeType`, `icarRecommendationType`, `icarRegistrationReasonType`, `icarReproCalvingEaseType`, `icarReproEmbryoFlushingMethodType`, `icarReproHeatCertaintyType`, `icarReproHeatDetectionMethodType`, `icarReproHeatIntensityType`, `icarReproHeatSignType`, `icarReproInseminationType`, `icarReproPregnancyMethodType`, `icarReproPregnancyResultType`, `icarReproSemenPreservationType`, `icarSetPurposeType`, `icarStatisticsPurposeType`, `icarTestDayCodeType`, `icarValidSampleFillingIndicatorType`, `icarWeightMethodType`, `icarWithdrawalProductType`, `uncefactDoseUnitsType`, `uncefactMassUnitsType`.

---

## 6. API

Стандарт определяет **два независимых интерфейса**. Выбирать между ними помогает `docs/location-or-data-exchange-api.md`.

### 6.1 Location-centric API (`docs/location-based-api.md`)

Идея: сервер выставляет по одному endpoint на пару «локация × тип сообщения». Локация — это географическое место, откуда происходят данные: ферма, коровник, участок. Идентифицируется парой scheme + value.

**Шаблон URL:**
```
/locations/{location-scheme}/{location-id}/{resource-collection}
```
и для батчей:
```
/batches/locations/{location-scheme}/{location-id}/{resource-collection}
```

Параметры пути (`components/parameters`):
- `location-scheme` — `in: path`, `required: true`, string. Схема идентификатора локации.
- `location-id` — `in: path`, `required: true`, string. Уникальный идентификатор локации.

Плюс есть `/locations` (GET) — перечисление доступных клиенту локаций, возвращает `icarLocationCollection`.

**Фактические пути по доменам** (из `url-schemes/`, версия `info.version = "1.5"`, tag вида `ADE-1.5-registration`, `servers[0].url = "https://icar-ade.standard.com"`):

`registrationURLScheme.json`:

| Путь | Методы |
|---|---|
| `/locations` | GET |
| `/locations/{location-scheme}/{location-id}/animals` | GET, POST |
| `/locations/{location-scheme}/{location-id}/births` | GET, POST |
| `/locations/{location-scheme}/{location-id}/deaths` | GET, POST |
| `/locations/{location-scheme}/{location-id}/arrivals` | GET, POST |
| `/locations/{location-scheme}/{location-id}/departures` | GET, POST |
| `/locations/{location-scheme}/{location-id}/group-births` | GET, POST |
| `/locations/{location-scheme}/{location-id}/group-deaths` | GET, POST |
| `/locations/{location-scheme}/{location-id}/group-arrivals` | GET, POST |
| `/locations/{location-scheme}/{location-id}/group-departures` | GET, POST |
| `/batches/locations/{location-scheme}/{location-id}/{animals\|births\|deaths\|arrivals\|departures\|group-*}` | POST |

`milkURLScheme.json`:

| Путь | Методы |
|---|---|
| `/locations/{ls}/{lid}/milking-visits` | GET, POST |
| `/locations/{ls}/{lid}/test-days` | GET, POST |
| `/locations/{ls}/{lid}/test-day-results` | GET, POST |
| `/locations/{ls}/{lid}/daily-milking-averages` | GET |
| `/locations/{ls}/{lid}/milk-predictions` | GET |
| `/locations/{ls}/{lid}/lactations` | GET |
| `/locations/{ls}/{lid}/lactation-status-observations` | GET, POST |
| `/locations/{ls}/{lid}/milking-withdrawals` | GET |
| `/batches/.../{milking-visits\|test-days\|test-day-results\|lactation-status-observations}` | POST |

`reproductionURLScheme.json`:

| Путь | Методы |
|---|---|
| `/locations/{ls}/{lid}/inseminations` | GET, POST |
| `/locations/{ls}/{lid}/parturitions` | GET, POST |
| `/locations/{ls}/{lid}/pregnancy-checks` | GET, POST |
| `/locations/{ls}/{lid}/heats` | GET, POST |
| `/locations/{ls}/{lid}/abortions` | GET, POST |
| `/locations/{ls}/{lid}/drying-offs` | GET, POST |
| `/locations/{ls}/{lid}/do-not-breeds` | GET, POST |
| `/locations/{ls}/{lid}/mating-recommendations` | GET, POST |
| `/locations/{ls}/{lid}/gestations` | GET, POST |
| `/locations/{ls}/{lid}/repro-status-observations` | GET, POST |
| `/locations/{ls}/{lid}/repro-embryo-flushings` | GET, POST |
| `/batches/...` | POST (у эмбриофлашинга батч называется `embryo-flushings`, без префикса `repro-` — расхождение в спецификации) |

`performanceURLScheme.json`:

| Путь | Методы |
|---|---|
| `/locations/{ls}/{lid}/weights` | GET, POST |
| `/locations/{ls}/{lid}/group-weights` | GET, POST |
| `/locations/{ls}/{lid}/breeding-values` | **только GET** |
| `/locations/{ls}/{lid}/conformation-scores` | GET, POST |
| `/locations/{ls}/{lid}/type-classifications` | GET, POST |
| `/batches/.../{weights\|group-weights\|conformation-scores}` | POST |

`managementURLScheme.json`:

| Путь | Методы |
|---|---|
| `/locations/{ls}/{lid}/animal-sets` | GET, POST |
| `/locations/{ls}/{lid}/animal-set-joins` | GET, POST |
| `/locations/{ls}/{lid}/animal-set-leaves` | GET, POST |
| `/locations/{ls}/{lid}/devices` | GET, POST |
| `/locations/{ls}/{lid}/statistics` | GET |
| `/locations/{ls}/{lid}/inventory-transactions` | GET |
| `/locations/{ls}/{lid}/medicine-inventory-transactions` | GET |
| `/locations/{ls}/{lid}/position-observations` | GET, POST |
| `/locations/{ls}/{lid}/group-position-observations` | GET, POST |
| `/locations/{ls}/{lid}/remarks` | GET, POST |
| `/locations/{ls}/{lid}/observation-summary-metrics` | GET, POST |

Ещё есть `healthURLScheme.json`, `feedURLscheme.json`, `sortingURLScheme.json`.

**Коллекции и пагинация.**

Базовый класс — `collections/icarResourceCollection.json`. Все поля необязательные.

| Поле | Тип | Что означает |
|---|---|---|
| `view` | object | Информация о текущей странице |
| `view.totalItems` | integer | Количество элементов в коллекции, если известно |
| `view.totalPages` | integer | Количество страниц, если известно |
| `view.pageSize` | integer | Если не ноль — число элементов на странице по умолчанию |
| `view.currentPage` | integer | Текущая страница, для отображения |
| `view.first` | string (uri) | Ссылка на первую страницу, link relation `first` |
| `view.next` | string (uri) | Ссылка на следующую страницу, `next` |
| `view.prev` | string (uri) | Ссылка на предыдущую, `prev` |
| `view.last` | string (uri) | Ссылка на последнюю, `last` |

Конкретные коллекции добавляют через `allOf` массив `member` нужного типа. Имя `member` взято из синтаксиса JSON-LD Hydra.

Никаких `offset` / `limit` в стандарте **нет**. Пагинацией управляет сервер через URI в `view`. Клиент опционально может задавать её query-параметрами, названными по полям `view` (например `page=2`) — но это не нормативно.

Тело ответа:
```json
{
  "view": { "totalItems": 1, "totalPages": 1, "pageSize": 10, "currentPage": 1 },
  "member": [ /* ресурсы */ ]
}
```

Ошибки — HTTP-статус плюс тело:
```json
{ "errors": [ { "id": "string", "status": 0, "code": "string",
                "title": "string", "detail": "string", "meta": {} } ] }
```
Поля: `id` — уникальный id события для трассировки в логах; `status` — HTTP-код для этой конкретной ошибки; `code` — серверный код для автоматического сопоставления; `title` — краткая человекочитаемая сводка; `detail` — развёрнутое человекочитаемое объяснение.

Батч-POST возвращает `icarBatchResult`: `id` (string, SHOULD быть UUID), `meta` (`icarMetaDataType`), `messages` (array of `icarResponseMessageResource` или null).

**Фильтры** (вики «Filtering resources»). Правила: сервер MAY реализовать любой фильтр; SHOULD реализовать RECOMMENDED; если реализует — MUST использовать имена из стандарта. Клиент не вправе рассчитывать, что фильтр поддержан, и должен быть готов получить больше данных, чем просил.

Соглашения об именах:
- Фильтр по полю называется как само поле: `gender=Female`, `specie=Buffalo`. Несколько разных полей — это AND. Одно поле, указанное дважды — это OR.
- Вложенное поле — через дефис от родителя: `diagnoses-name`.
- Диапазон — суффиксы `-from` и `-to`: `birthDate-from=2020-01-01`, `birthDate-to=2020-02-01`. `from` включительно, `to` исключительно.
- Составные поля (id + scheme) разворачиваются в два параметра: `animal-id=...` и `animal-scheme=...`. Использовать только один из пары не рекомендуется.

Определённые в `components/parameters` query-параметры:

| Параметр | Где | Что означает |
|---|---|---|
| `meta-modified-from` | query, string date-time | Начало диапазона по дате изменения |
| `meta-modified-to` | query, string date-time | Конец диапазона по дате изменения |
| `animal-scheme` | query, string, не обязателен | Схема идентификатора животного |
| `animal-id` | query, string, не обязателен | Идентификатор животного |

Рекомендованные имена фильтров из вики: `meta-source`, `meta-modified-from`/`-to`, `meta-created-from`/`-to`, `meta-creator`, `meta-validFrom`/`validTo`, `start-date-time` / `end-date-time` (предпочтительнее использовать `meta-modified-*`), `animal-id` + `animal-scheme`, `location-id` + `location-scheme`.

OData рассмотрен и **отвергнут** как слишком тяжёлый для реализации на стороне сервера.

**Безопасность:** всё общение SHOULD идти по HTTPS. RECOMMENDED использовать JWT. Сервер сопоставляет клиента с набором claims, дающих доступ к определённым локациям; ожидается, что claims задаются как «разрешённые типы сообщений на локацию», чтобы проверку можно было делать целиком по URI, не разбирая тело.

### 6.2 Generic Data Exchange API (`docs/generic-data-exchange-api.md`)

Идея: сервер выставляет наборы данных (datasets). Каждый dataset содержит ресурсы одного или нескольких типов и выставляет ленту изменений. Клиенту **не нужно знать про локации**. Всего **четыре endpoint-а**, и этого хватает для обмена любыми ресурсами ADE. Добавление новых типов ресурсов не требует изменения API.

| Endpoint | Метод | Назначение |
|---|---|---|
| `/datasets` | GET | Список выставленных датасетов |
| `/datasets/{datasetid}` | GET | Один датасет |
| `/datasets/{datasetid}/changes?since={sinceToken}` | GET | Лента изменений |
| `/dataset/{datasetid}/resources` | POST | Push-режим (обратите внимание: в спецификации здесь `dataset` в единственном числе) |

Схема датасета:

| Поле | Тип | Обязательность | Что означает |
|---|---|---|---|
| `name` | string | **да** | Уникальное имя датасета на этом сервере |
| `url` | string | **да** | URL датасета |
| `changes` | string | **да** | URL ленты изменений этого датасета |
| `containedTypes` | array of string | нет | Имена типов ресурсов в этом датасете |

Ответ `/changes` — массив JSON-объектов:
1. Первый объект — контекст: `{"id": "@context", "description": "..."}`, зарезервирован на будущее (JSON-LD, Entity Graph Data Model).
2. Далее — сами ресурсы ADE.
3. Последний объект — продолжение: `{"id": "@continuation", "token": "..."}`.

Для валидности в этом протоколе у каждого ресурса **обязательны**: `location`, `meta.sourceId` (уникален среди всех ресурсов сервера), `meta.source`, `resourceType`.

Обработка на стороне клиента, строго по порядку и для каждой сущности:
1. Если `meta.isDeleted == true` — локальный ресурс с этим `sourceId` MUST быть удалён или помечен удалённым.
2. Если локальной версии нет — MUST быть создана, `sourceId` MUST быть связан с локальным объектом.
3. Если локальный объект с этим `sourceId` есть — его представление MUST быть заменено полученным. Реализация вправе делать дельты, но результат должен быть тем же.

`token` — непрозрачная base64-строка, выданная сервером. Клиент **не должен** её модифицировать: поведение при модификации не определено. Клиент хранит токен и передаёт его как `since` в следующем запросе. Токен следует сохранять только после успешной обработки всех ресурсов ответа.

Если сервер перезалил все данные датасета и клиенту нужна полная пересинхронизация, сервер возвращает HTTP-заголовок:
```
icar-full-sync: true
```
Получив его, клиент должен удалить все локальные данные этого датасета, отбросить токены и начать с `/changes`.

Push-семантика та же, с двумя исключениями: заголовок full sync в push не принимается; тело push MUST содержать только контекст и ресурсы, без объекта продолжения. Успех — 200 OK; при любом другом коде клиент MUST считать, что сервер не сохранил состояние. Рекомендуется разводить push и pull на разные endpoint-ы датасетов.

### 6.3 Время

Везде RFC3339, UTC, с суффиксом `Z`. Ориентир, указанный в самих схемах: https://ijmacd.github.io/rfc3339-iso8601/

Тип `icarDateTimeType` — `{"type": "string", "format": "date-time"}`. Отдельно есть `icarDateType` для дат без времени. Длительности (`icarDurationType`) с версии 1.5 приведены к синтаксису периодов ISO 8601.

---

## 7. Что означает соответствие

Формальной сертификации соответствия ADE **нет**. Прямая цитата из README раздела «Compliance»: соответствие не определено сверх того, что подразумевается JSON Schema для типов данных и что сказано в документации соответствующего API.

Практические следствия:

- Никакого органа, выдающего сертификат «ADE-compliant», и никакого реестра сертифицированных реализаций не существует.
- Заявление о поддержке делается указанием версии стандарта. В самих OpenAPI-файлах это выражено полем `info.version` (сейчас `"1.5"`) и тегами операций вида `ADE-1.5-registration`, `ADE-1.5-milk` и так далее. Это же — разумный способ заявлять поддержку в своей документации: «поддерживаем ADE 1.5, ресурсы X, Y, Z, endpoint-ы такие-то».
- Из фактически проверяемого есть только валидация по JSON Schema (2020-12) и по OpenAPI 3.1. В репозитории лежит `.spectral.yaml` — конфигурация линтера Spectral, которым проверяются сами схемы.
- Поле `icarCertified` в `icarMilkRecordingMethodType` — это НЕ про соответствие ADE. Оно про сертификацию ICAR метода молочного контроля, то есть про совсем другой стандарт ICAR (ICAR Guidelines).
- Стандарт нормативен только в части модели данных. API-спецификация в README и в презентации Cooke прямо названа **informative** («A normative data model, informative API specification, and support for code generation»).

---

## 8. Что говорят презентации о реальных внедрениях

### Andrew Cooke (Map of Agriculture Group, CTO; ADE Standards Workshop)

Позиционирование: открытая спецификация для интероперабельности информации о животных. Поддерживает несколько видов и направлений, при этом молочный скот признаётся основным сценарием. Стандартизует данные **в точке интеграции между системами** — внутреннее представление можно оставлять своим и маппить. Это техническая спецификация для аналитиков и разработчиков. Основана на JSON Schema; RDF и UML планируются в координации с ISO/TC/347.

Ключевые понятия, которые он выделяет: Resources (логические сущности, которые можно получить или отправить, и у которых есть метаданные), Collections (пагинация), Events (наблюдения в точке времени), Identifiers (расширяемые, признающие существующие стандарты).

Что советует делать первым — дословный чеклист «Getting started»:
1. Читать вики и папку `docs`.
2. Следить за каналами Discussions и Issues.
3. Сделать собственный форк ветки `ADE-1` и начинать работу с него.
4. Использовать OpenAPI Generator для генерации кода; для OpenAPI 3.1 брать Generator 7.9.0 или выше.
5. Bundled scheme (все API одним файлом) — на подходе (в 1.5.x уже есть).
6. Начинается Pydantic-проект (сейчас это https://github.com/adewg/ICAR-pydantic).

Подход «схема + id» он подчёркивает отдельно: он одинаково применяется к животным, локациям, диагнозам, породам, метрикам, причинам.

### Erwin Speybroeck (CRV, Product Owner; член технической рабочей группы ADE)

Реальные внедрения CRV (кооператив по разведению КРС, Нидерланды/Бельгия) — конкретные цифры:

| Партнёр | Масштаб | Что обменивается |
|---|---|---|
| Lely | около 1500 ферм | движения животных, репродукция, milking visits — **в обе стороны** |
| Lely | ещё около 1000 ферм | только milking visits |
| GEA | около 20 ферм, пилот завершён, идёт раскатка, число растёт еженедельно | в обе стороны |
| DeLaval (DelPro 5.10+) | 58 ферм | движения и репродукция из CRV, milking visits от DeLaval |
| Fullwood (Crystal) | 75 ферм | то же |
| Nedap Now | 3 фермы, пилот, готово к раскатке | — |
| Vetwerk (ветеринарный софт) | 300 ферм | Vetwerk получает движения животных, данные репродукции, test-day results; CRV получает pregnancy checks и do-not-breed статусы |

В тестовой или разведочной фазе: Datamars, Rovecom (кормовая отрасль), Agrifirm, Boumatic, Smaxtec.

Вывод для нас: на практике ядро обмена — это **движения животных, репродукция, milking visits и test-day results**. Именно эти четыре группы повторяются во всех интеграциях.

### Jasper van der Noord (UNIFORM-Agri, Product Manager)

Показывает многоуровневую архитектуру: система управления стадом на ферме, облако консультанта, облако BI третьей стороны, центральная система организации молочного контроля. UNIFORM выступает и как клиент, и как сервер.

Набор endpoint-ов в их реальном сценарии:
- Клиентский API к центральной системе молочного контроля: **GET** Locations, Registration, Milk (test results).
- Серверный API UNIFORM для облака консультанта: **GET** Locations, Management, Registration, Reproduction, Milk, Health, Performance, Feed; **POST/PUT** Registration, Reproduction, Milk (milkmeter).
- К доильным и сенсорным системам на ферме: **GET** Locations, Registration, Milk, Feed (intake), Attention; **POST/PUT** Management, Registration, Reproduction, Feed (recommendation).

Базовые шаги, которые он рекомендует:
1. Договориться, какие данные вообще обмениваются.
2. Направить разрабатывающую сторону на GitHub ICAR.
3. Другая сторона разрабатывает API по спецификации.
4. UNIFORM подключается, обмен начинается.
5. «Выглядит просто и прямолинейно, но приложить чуть больше усилий окупается».

Что он называет проблемами и как их предотвращать:
- Из-за очень широкого охвата (фермерские системы, национальные базы, наука) GitHub ICAR содержит очень много ресурсов. Для конкретного обмена нужны далеко не все, и это **подавляет новичка**. UNIFORM явно проводит нового пользователя к нужным ресурсам.
- Лучшая практика добавления и удаления животных — использовать registration-endpoint-ы **births, deaths, purchase (arrivals), departures**, а не редактировать список животных.
- События (например Birth) требуют свойства DateTime в UTC. Значит, и клиент, и сервер обязаны хранить у себя и дату, **и время**. Это регулярно оказывается препятствием.
- Обязательно заранее договориться об идентификаторах животных.

Про кодовые списки: ADE даёт хорошую возможность обмениваться данными о здоровье благодаря ICAR Central Health Key — обе системы маппят свои события на код ICAR. Обмен другими кодами (он приводит в пример departure codes) стандарт тоже поддерживает, но при этом **разрешает от него отклоняться**, и это делает обмен с несколькими системами менее стандартным.

---

## 9. Что реализовать в первую очередь

Минимальный набор для племенной книги, в порядке приоритета. Логика отбора: сначала то, без чего племенная книга не является племенной книгой (идентичность, происхождение, факт рождения), затем то, что подтверждается практикой внедрений CRV и UNIFORM.

### Шаг 1. Ядро идентичности

1. **`icarIdentifierType` + `icarAnimalIdentifierType`** — вся модель идентификации. Это `scheme` + `id`, две строки. Реализуется первым, потому что от него зависит буквально всё остальное. Для России национальной схемы в реестре ADE нет: заводим собственную в обратной доменной нотации (например `ru.<организация>.<реестр>`) и/или используем `composite.withinherdid` для внутрихозяйственных номеров.
2. **`icarResource` + `icarMetaDataType`** — базовый ресурс и метаданные. Без `meta.source` и `meta.sourceId` невозможна синхронизация, а рабочая группа уже объявила, что в 2.0 они станут обязательными. Делать сразу правильно дешевле, чем переделывать.
3. **`icarAnimalCoreResource`** (вместе с `icarAnimalBaseResource`, `icarParentageType`, `icarBreedFractionsType`) — карточка животного с происхождением и кровностью. Это буквально запись племенной книги. Массив `parentage` с полем `parentOf` позволяет отдавать многопоколенную родословную одним ресурсом.
4. **`icarAnimalCoreCollection`** и `icarResourceCollection` — пагинация. Тривиально, но без неё любой реальный обмен упирается в размер ответа.

Endpoint: `GET/POST /locations/{location-scheme}/{location-id}/animals`, плюс `GET /locations`.

### Шаг 2. Регистрация и движение

5. **`icarMovementBirthEventResource`**, **`icarMovementArrivalEventResource`**, **`icarMovementDepartureEventResource`**, **`icarMovementDeathEventResource`**.

Почему именно они и именно вторыми: van der Noord прямо называет это best practice — животных добавляют и убирают **не редактированием списка, а событиями births / deaths / arrivals / departures**. Speybroeck подтверждает: движения животных присутствуют во всех без исключения интеграциях CRV. Это самый совместимый слой стандарта.

Здесь же — договорённость про UTC. Требование `eventDateTime` в RFC3339 UTC с временем означает, что в БД нужно хранить именно timestamp, а не дату. Van der Noord называет это типичным местом, где интеграции спотыкаются.

### Шаг 3. Репродукция

6. **`icarReproParturitionEventResource`** + **`icarProgenyDetailsResource`** — отёл. Для племенной книги это событие, порождающее новую запись и связывающее её с матерью. `progenyDetails` наследует `icarAnimalBaseResource`, поэтому телёнка можно описать почти полностью прямо в событии отёла.
7. **`icarReproInseminationEventResource`** — осеменение с `sireIdentifiers`. Это вторая половина происхождения: отцовство подтверждается осеменением.
8. **`icarReproPregnancyCheckEventResource`** — проверка стельности. Замыкает репродуктивный цикл и, по данным CRV, входит в обратный поток даже в самых узких интеграциях (Vetwerk шлёт в CRV именно pregnancy checks).

### Шаг 4. Продуктивность

9. **`icarTestDayResultEventResource`** + `icarMilkCharacteristicsType` + `icarMilkCharacteristicCodeType` — контрольное доение. Удой в `milkWeight24Hours`, жир `FAT`, белок `PROTEIN`, соматика `SCC` — в массиве `milkCharacteristics`. Это основной племенной показатель молочного скота и, по Speybroeck, один из четырёх реально ходящих между системами типов данных.
10. **`icarTestDayResource`** — сам контрольный день, если нужна привязка результатов к сессии.
11. **`icarLactationResource`** — сводка по лактации (305 дней и прочее через `lactationType`).

### Шаг 5. Экстерьер и племенная ценность

12. **`icarConformationScoreEventResource`** / **`icarTypeClassificationEventResource`** — оценка экстерьера. Брать сразу `icarTypeClassificationEventResource`, потому что реальная бонитировка — это набор оценок за один визит, а не одна оценка.
13. **`icarBreedingValueResource`** — племенная ценность. Только на отдачу (endpoint GET-only).
14. **`icarWeightEventResource`** — взвешивание. Дёшево реализуется, нужно для мясных пород и для контроля выращивания ремонтного молодняка.

### Чего в первую очередь НЕ делать

`icarAnimalSetResource` и групповые события, кормление, здоровье, инвентарь, устройства, туши, сортировка. Van der Noord прямо предупреждает: широта охвата ADE подавляет — для конкретного обмена нужна малая доля ресурсов. Племенной книге группы животных и кормление не нужны.

### Какой API выбрать

Начинать с **location-centric**. Причины: это то, что реализовано у всех партнёров в презентациях (Lely, GEA, DeLaval, Fullwood, Nedap, UNIFORM — все говорят про `/locations/...` endpoint-ы); URL-схемы для него готовы и генерируются в код одной командой; отладка проще, потому что каждый endpoint отвечает за одну понятную вещь.

Generic Data Exchange API имеет смысл добавлять позже, когда появится задача массовой синхронизации между агрегаторами и не захочется завязываться на понятие локации. Он требует надёжного `meta.sourceId` на каждом ресурсе — ещё одна причина сделать метаданные правильно на шаге 1.

### Практический совет по кодогенерации

Не собирать модель по файлам вручную. Брать `bundled-schemes/combinedURLScheme.json` и генерировать код: OpenAPI Generator 7.9.0+ для C#/Java, либо готовый проект `adewg/ICAR-pydantic` для Python. Это прямая рекомендация из ReleaseNotes и из презентации Cooke.

---

## 10. Чего в стандарте нет

Честный список пробелов относительно задач российской племенной книги.

### 10.1 Комплексный класс и бонитировка

Понятия **комплексного класса** (элита-рекорд, элита, первый класс, второй класс) в ADE нет вообще — ни ресурса, ни перечисления, ни поля. Российская бонитировка как единая процедура с итоговым классом стандартом не покрывается. `icarConformationTraitType` содержит значения `FinalScore` и `Type`, но это оценки экстерьера в баллах, а не сословный класс.

Обходной путь: передавать как отдельный признак через `traitLabel` (`icarTraitLabelIdentifierType`) со своей схемой, либо через `icarConformationScoreType` с собственным значением признака — но собственное значение не пройдёт валидацию `icarConformationTraitType`, потому что это закрытый enum.

### 10.2 Линейная оценка по нашим шкалам

`icarConformationScoreType.score` — это `number` без ограничений в схеме, но описание задаёт диапазоны: 1–9 для линейных признаков, обычно 50–99 для комплексных. Российская линейная оценка использует другие шкалы и другой набор признаков. Список `icarConformationTraitType` — **закрытый enum из 68 значений**, ориентированный на руководство ICAR (ICAR Guidelines Section 5, Conformation Recording). Признаков, которых там нет, передать нечем: расширить enum можно только через PR в репозиторий.

Отдельно: **шкалу оценки стандарт не передаёт**. В событии нет поля «по какой шкале выставлена оценка». Есть только `method` (Manual / Automated). Если у вас 1–9 и 1–5 сосуществуют — различить их получателю будет нечем.

### 10.3 Племенная ценность — ресурс есть, содержания нет

`icarBreedingValueResource` существует и структурно нормален. Но:
- Реестр схем баз племенной ценности `well-known/icarBVBaseIdentifierType.md` **пуст**: ни одной зарегистрированной схемы.
- Список признаков для племенной ценности не задан стандартом: `traitLabel` — свободная пара scheme + id, единственная зарегистрированная схема — `icar.idea` (ICAR IDEA Trait Codes от Interbull).
- Индексов, весов признаков, селекционных индексов как структуры — нет. Только плоский список «признак — значение — достоверность».
- Endpoint только GET. Отправить племенную ценность в чужую систему по location-centric API стандартными средствами нельзя (можно через Generic Data Exchange API push).

Практически это значит: договариваться о конкретных признаках и базах придётся в двустороннем порядке, стандарт тут даёт только конверт.

### 10.4 Генотипирование и генетические данные

Ничего. Нет ресурса для отбора генетического образца, нет для результата генотипирования, нет для SNP, нет для генетических дефектов и гаплотипов, нет для подтверждения происхождения по ДНК. Единственное упоминание геномики — значение `GenomicBreedingValue` в `icarBreedingValueCalculationType`.

Для племенной книги, работающей с геномной оценкой, это существенный пробел: обмениваться можно только результатом (готовой GEBV), не исходными данными и не фактом взятия пробы.

### 10.5 Подтверждение происхождения

Нет ресурса или поля, фиксирующего, что родство **проверено** (ДНК-тест, микросателлиты, SNP-верификация). `icarParentageType.relation` различает только `Genetic` / `Recipient` / `Adoptive`, но не уровень достоверности и не метод подтверждения.

### 10.6 Племенная книга как сущность

Понятия «племенная книга», «раздел книги», «регистрация в книге», «статус в книге» в стандарте нет. Есть только поле `officialName` («Official herdbook name») в `icarAnimalBaseResource` и `icarParentageType`, плюс схемы идентификаторов вроде `dk.herdbooknumber` и `us.bovine` («US Lifetime Herdbook number»). То есть номер в племенной книге передаётся как ещё один идентификатор в `alternativeIdentifiers`, но самой сущности книги, её разделов и правил допуска в модели нет.

### 10.7 Организации и люди

`icarEventCoreResource.responsible` — это **string**, при том что в описании самой схемы написано «SHOULD be a person object». То есть тип для человека не проработан. Есть `icarOrganizationType`, `icarOrganizationIdentifierType`, `icarOrganizationIdentityType`, `PostalAddress` — но нет ресурса «эксперт-бонитёр», «племенное хозяйство как юрлицо», «ассоциация».

### 10.8 Выставки, испытания, награды

Ничего. В `icarArrivalReasonType` и `icarDepartureKindType` есть `Show` / `ShowReturn` — то есть факт вывоза на выставку зафиксировать можно, но результаты выставки, места, награды — нет.

### 10.9 Прочие расхождения и шероховатости, замеченные при сверке

- В `resourceTypeCatalog.md` два дискриминатора не совпадают с именами файлов ресурсов: `icarReproInsemonationEventResource` (опечатка, файл `icarReproInseminationEventResource.json`) и `icarTestDayResultResource` (файл `icarTestDayResultEventResource.json`). Если генерировать код по каталогу — сломается.
- В `icarTypeClassificationEventResource.json` блок `required` содержит `score` и `traitScored`, которых у этого ресурса нет.
- В `enums/icarMilkCharacteristicCodeType.json` код `PAG` описан в тексте, но отсутствует в `enum`; `TEMPERATURE` есть в `enum`, но не описан и не имеет единицы.
- Батч-путь для эмбриофлашинга называется `embryo-flushings`, тогда как обычный — `repro-embryo-flushings`.
- `docs/README.md` заявляет «Current Version: ADE 1.3» при фактической 1.5.1.
- Поле лактозы в `icarLactationResource` называется `lactosisAmount`, а не `lactoseAmount`.

### 10.10 Итог по пробелам

ADE хорошо покрывает **операционный слой**: идентичность животного, происхождение как факт, движения, репродуктивные события, контрольные доения, взвешивания. Это ровно то, чем реально обмениваются системы в описанных внедрениях.

ADE **слабо покрывает оценочно-племенной слой**: комплексный класс, национальные шкалы линейной оценки, структуру селекционных индексов, геномику, подтверждение происхождения, саму сущность племенной книги. Здесь стандарт даёт только конверты (`traitLabel`, `icarBreedingValueResource`, свободные схемы идентификаторов), а содержимое конвертов придётся определять самим и договариваться о нём двусторонне.

Вывод: ADE стоит использовать как транспорт для операционных данных и как способ говорить на одном языке с доильным оборудованием, ветеринарным софтом и зарубежными базами. Собственную племенную модель он не заменяет.

---

## Источники

Основные (сверка проведена 2 сентября 2026 года по ветке `ADE-1`):

- Репозиторий: https://github.com/adewg/ICAR
- README (версия, лицензия, нормативные разделы, compliance): https://github.com/adewg/ICAR/blob/ADE-1/README.md
- Release notes ADE 1.5.1: https://github.com/adewg/ICAR/blob/ADE-1/ReleaseNotes.md
- Релизы: https://github.com/adewg/ICAR/releases
- Changelog: https://github.com/adewg/ICAR/blob/ADE-1/CHANGELOG.md
- Ресурсы: https://github.com/adewg/ICAR/tree/ADE-1/resources
- Типы: https://github.com/adewg/ICAR/tree/ADE-1/types
- Перечисления: https://github.com/adewg/ICAR/tree/ADE-1/enums
- Коллекции: https://github.com/adewg/ICAR/tree/ADE-1/collections
- URL-схемы: https://github.com/adewg/ICAR/tree/ADE-1/url-schemes
- Собранные схемы: https://github.com/adewg/ICAR/tree/ADE-1/bundled-schemes
- Каталог типов ресурсов: https://github.com/adewg/ICAR/blob/ADE-1/resources/resourceTypeCatalog.md

Документация:

- Location-based API: https://github.com/adewg/ICAR/blob/ADE-1/docs/location-based-api.md
- Generic Data Exchange API: https://github.com/adewg/ICAR/blob/ADE-1/docs/generic-data-exchange-api.md
- Как выбрать между API: https://github.com/adewg/ICAR/blob/ADE-1/docs/location-or-data-exchange-api.md
- Группы и наборы животных: https://github.com/adewg/ICAR/blob/ADE-1/docs/understanding-animal-groups.md

Вики:

- Перечень ресурсов: https://github.com/adewg/ICAR/wiki/Resource-entities
- Схемы идентификаторов: https://github.com/adewg/ICAR/wiki/Schemes
- Фильтрация ресурсов и пагинация: https://github.com/adewg/ICAR/wiki/Filtering-resources
- Реализация клиента: https://github.com/adewg/ICAR/wiki/Implementing-a-client-application
- Реализация сервиса: https://github.com/adewg/ICAR/wiki/Implementing-a-service
- Версии, релизы и ветки: https://github.com/adewg/ICAR/wiki/Versioning,-releases-and-branches

Реестры well-known схем:

- Животные: https://github.com/adewg/ICAR/blob/ADE-1/well-known/icarAnimalIdentifierType.md
- Породы: https://github.com/adewg/ICAR/blob/ADE-1/well-known/icarBreedIdentifierType.md
- Локации: https://github.com/adewg/ICAR/blob/ADE-1/well-known/icarLocationIdentifierType.md
- Признаки: https://github.com/adewg/ICAR/blob/ADE-1/well-known/icarTraitLabelIdentifierType.md
- Базы племенной ценности (пуст): https://github.com/adewg/ICAR/blob/ADE-1/well-known/icarBVBaseIdentifierType.md

Презентации ICAR ADE Standards Workshop:

- Andrew Cooke, «Animal Data Exchange Specification. Getting started…»: https://www.icar.org/wp-content/uploads/documents/ADE-Standards-Workshop-Andrew-Cooke.pdf
- Erwin Speybroeck (CRV), «Use cases implementing the ICAR ADE standard for smarter data exchange»: https://www.icar.org/wp-content/uploads/documents/ADE-Standards-Workshop-Erwin-Speybroeck.pdf
- Jasper van der Noord (UNIFORM-Agri), «Connecting Dairy Data: Integration of ICAR ADE for multi-level Agricultural Data Systems»: https://www.icar.org/wp-content/uploads/documents/ADE-Standards-Workshop-Jasper-Van-Der-Noord.pdf

Смежное:

- Коды пород ICAR (Interbull): https://interbull.org/ib/icarbreedcodes
- ICAR IDEA Trait Codes (Interbull): https://interbull.org/ib/idea_trait_codes
- ICAR Guidelines, Section 5 Conformation Recording: https://www.icar.org/Guidelines/05-Conformation-Recording.pdf
- Python-модели по ADE: https://github.com/adewg/ICAR-pydantic
- Ориентир по формату RFC3339/ISO8601: https://ijmacd.github.io/rfc3339-iso8601/
