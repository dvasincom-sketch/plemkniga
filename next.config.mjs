import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  images: {
    remotePatterns: [],
  },

  /**
   * Страницы для стран ЕАЭС переехали на витрину продукта.
   *
   * Они жили на домене книги (`/eaeu/ru`) до того, как появился
   * `plem.online`, и с его появлением стали второй копией одного и того же
   * текста по чужому адресу. Хуже того — копией на домене голштинской
   * ассоциации: казахское хозяйство, пришедшее по такой ссылке, читало
   * предложение продукта в чужом кабинете, с чужим подвалом и чужими
   * реквизитами.
   *
   * Перенаправление постоянное (301), а не временное. Адрес не вернётся:
   * ссылки, которые успели разойтись, должны у поисковика заменить старый
   * адрес на новый, а не ходить через нас вечно.
   *
   * Язык из адреса при этом теряется намеренно. `plem.online` сам
   * определит его по браузеру — и определит вернее: в старой ссылке стоит
   * язык того, кто её отправил, а не того, кто по ней идёт.
   */
  async redirects() {
    return [
      { source: '/eaeu', destination: 'https://plem.online/', permanent: true },
      { source: '/eaeu/:path*', destination: 'https://plem.online/', permanent: true },
    ]
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
