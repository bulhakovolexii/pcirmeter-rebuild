/**
 * Звіт ODT (OpenDocument Text, ODF 1.3) — той самий зміст, що й PDF (docs/spec/report.md), для
 * редагування в LibreOffice / Word. Без DOM і без залежностей: XML + ZIP без стиснення (`binary.ts`).
 * Рисунки — SVG (`figures.ts`), які растеризує `rasterize` (у браузері — canvas), у документі — PNG.
 */

import { jpegSize } from '../ui/photo'
import { base64, encodePng, upscale, zip, type ZipEntry } from './binary'
import {
  CONTENT_W,
  documentTitle,
  fileSection,
  footerText,
  hasClosing,
  MARGIN,
  PAGE_H,
  PAGE_W,
  PARAM_COLUMNS,
  RESULT_COLUMNS,
  sectionContext,
  TITLE_COLUMNS,
  titleRows,
  type Cell,
  type FileSection,
  type ReportFile,
  type ReportMeta,
  type ReportOptions,
  type SectionContext,
} from './content'
import { distributionSvg, escapeXml, irFigureSvg, paletteStrip, profileSvg, type Svg } from './figures'

/** SVG → PNG із `scale` пікселів на пункт. */
export type Rasterize = (svg: Svg, scale: number) => Promise<Uint8Array>

export interface OdtOptions {
  rasterize: Rasterize
  /** `@font-face` для рисунків (шрифт підписів під час растеризації). */
  fontCss?: string
}

export const ODT_MIME = 'application/vnd.oasis.opendocument.text'

/** Пікселів PNG на пункт рисунка (≈ 216 dpi). */
const RASTER_SCALE = 3

const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
  'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" ' +
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"'

const XML = '<?xml version="1.0" encoding="UTF-8"?>\n'
const INK = '#2a2a2a'
const MUTED = '#6b6b6b'
const ACCENT = '#a0001b'
const RULE = '#d1d1d1'

const pt = (v: number) => `${Math.round(v * 100) / 100}pt`

/** Текст для XML: керувальні символи — геть, переноси рядків — `<text:line-break/>`, кілька пробілів — `<text:s/>`. */
function inline(value: string): string {
  return (
    value
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex -- символи, недопустимі в XML 1.0
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .split('\n')
      .map((l) =>
        escapeXml(l)
          .replace(/\t/g, '<text:tab/>')
          .replace(/ {2,}/g, (s) => ` <text:s text:c="${s.length - 1}"/>`),
      )
      .join('<text:line-break/>')
  )
}

const p = (style: string, body: string) => `<text:p text:style-name="${style}">${body}</text:p>`
const h = (style: string, level: number, body: string) =>
  `<text:h text:style-name="${style}" text:outline-level="${level}">${inline(body)}</text:h>`

/** Абзаци з порожніми рядками між ними. */
const paragraphs = (style: string, value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((par) => p(style, inline(par)))
    .join('')

class Pictures {
  readonly entries: ZipEntry[] = []

  add(data: Uint8Array, ext: 'png' | 'jpg'): string {
    const name = `Pictures/image${this.entries.length + 1}.${ext}`
    this.entries.push({ name, data })
    return name
  }

  frame(href: string, width: number, height: number): string {
    return (
      `<draw:frame draw:style-name="Image" draw:name="${href.slice(9)}" text:anchor-type="as-char" ` +
      `svg:width="${pt(width)}" svg:height="${pt(height)}" draw:z-index="0">` +
      `<draw:image xlink:href="${href}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
      '</draw:frame>'
    )
  }
}

/** Таблиця з межами клітинок; `header` — рядок заголовка, що повторюється на кожній сторінці. */
function table(
  name: string,
  header: readonly Cell[] | null,
  rows: readonly (readonly Cell[])[],
  small: boolean,
) {
  const para = (c: Cell) => {
    const style = `${small ? 'Table_Small' : 'Table_Contents'}${c.align === 'right' ? '_Right' : ''}`
    const span = c.flag ? (c.bold ? 'T_FlagBold' : 'T_Flag') : c.bold ? 'T_Bold' : ''
    const body = inline(c.text)
    return p(style, span ? `<text:span text:style-name="${span}">${body}</text:span>` : body)
  }
  const row = (cells: readonly Cell[], cellStyle: string) =>
    `<table:table-row>${cells
      .map(
        (c) =>
          `<table:table-cell table:style-name="${cellStyle}" office:value-type="string">${para(c)}</table:table-cell>`,
      )
      .join('')}</table:table-row>`
  const columns = rows[0]?.length ?? header?.length ?? 0
  const cols = Array.from(
    { length: columns },
    (_, i) => `<table:table-column table:style-name="${name}.C${i + 1}"/>`,
  ).join('')
  return (
    `<table:table table:name="${name}" table:style-name="${name}">${cols}` +
    (header ? `<table:table-header-rows>${row(header, 'Cell_Head')}</table:table-header-rows>` : '') +
    rows.map((r) => row(r, 'Cell')).join('') +
    '</table:table>'
  )
}

/** Стилі ширини таблиці й колонок (автоматичні стилі `content.xml`). */
function tableStyles(name: string, widths: readonly number[]): string {
  const total = widths.reduce((a, b) => a + b, 0)
  return (
    `<style:style style:name="${name}" style:family="table"><style:table-properties style:width="${pt(total)}" ` +
    'table:align="left" fo:margin-top="0pt" fo:margin-bottom="0pt"/></style:style>' +
    widths
      .map(
        (w, i) =>
          `<style:style style:name="${name}.C${i + 1}" style:family="table-column">` +
          `<style:table-column-properties style:column-width="${pt(w)}"/></style:style>`,
      )
      .join('')
  )
}

/** Створює ODT-звіт за знімками переглядачів `files` (порядок — як у списку). */
export async function buildOdt(
  meta: ReportMeta,
  files: readonly ReportFile[],
  { rasterize, fontCss }: OdtOptions,
  options: ReportOptions,
): Promise<Uint8Array> {
  const { t, locale } = options
  const ctx = sectionContext(options)
  const pictures = new Pictures()
  const styles: string[] = [tableStyles('Title', TITLE_COLUMNS)]
  const body: string[] = []

  body.push(p('Report_Title', inline(t('report.title'))))
  const title = titleRows(meta, options).map(([k, v]) => [{ text: k, bold: true }, { text: v }])
  if (title.length > 0) body.push(table('Title', null, title, false))
  if (meta.description.trim()) {
    body.push(h('Heading_2', 2, t('report.description')))
    body.push(paragraphs('Text', meta.description))
  }

  for (const [index, file] of files.entries()) {
    const section = fileSection(file, index, ctx)
    body.push(...(await fileBody(section, index, ctx, pictures, styles, fontCss, rasterize)))
  }

  if (hasClosing(meta)) {
    styles.push(tableStyles('Signatures', [CONTENT_W / 2, CONTENT_W / 2]))
    if (meta.conclusion.trim()) {
      body.push(h('Heading_2', 2, t('report.conclusion')))
      body.push(paragraphs('Text', meta.conclusion))
    }
    const sign = (label: string, name: string) =>
      `<table:table-cell table:style-name="Cell_Plain" office:value-type="string">` +
      p(
        'Signature',
        `<text:span text:style-name="T_Bold">${inline(label)}:</text:span> ________________________`,
      ) +
      p('Small', inline(name.trim())) +
      '</table:table-cell>'
    body.push(
      '<table:table table:name="Signatures" table:style-name="Signatures">' +
        '<table:table-column table:style-name="Signatures.C1"/><table:table-column table:style-name="Signatures.C2"/>' +
        `<table:table-row>${sign(t('report.author'), meta.author)}${sign(t('report.teacher'), meta.teacher)}</table:table-row>` +
        '</table:table>',
    )
  }

  const content =
    XML +
    `<office:document-content ${NS} office:version="1.3">` +
    `<office:automatic-styles>${automaticStyles()}${styles.join('')}</office:automatic-styles>` +
    `<office:body><office:text>${body.join('')}</office:text></office:body></office:document-content>`

  const encoder = new TextEncoder()
  const manifest =
    XML +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' +
    `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${ODT_MIME}"/>` +
    ['content.xml', 'styles.xml', 'meta.xml']
      .map((f) => `<manifest:file-entry manifest:full-path="${f}" manifest:media-type="text/xml"/>`)
      .join('') +
    pictures.entries
      .map(
        (e) =>
          `<manifest:file-entry manifest:full-path="${e.name}" manifest:media-type="${e.name.endsWith('.png') ? 'image/png' : 'image/jpeg'}"/>`,
      )
      .join('') +
    '</manifest:manifest>'

  return zip([
    { name: 'mimetype', data: encoder.encode(ODT_MIME) },
    { name: 'META-INF/manifest.xml', data: encoder.encode(manifest) },
    { name: 'meta.xml', data: encoder.encode(metaXml(meta, options)) },
    { name: 'styles.xml', data: encoder.encode(stylesXml(meta, options, locale)) },
    { name: 'content.xml', data: encoder.encode(content) },
    ...pictures.entries,
  ])
}

async function fileBody(
  section: FileSection,
  index: number,
  ctx: SectionContext,
  pictures: Pictures,
  styles: string[],
  fontCss: string | undefined,
  rasterize: Rasterize,
): Promise<string[]> {
  const { t } = ctx
  const { file } = section
  const ir = file.thermogram.ir
  const out: string[] = []
  // Кожна термограма — з нової сторінки (у PDF перша може лишитися на титульній — тут текстовий процесор сам перенесе)
  out.push(h(index > 0 ? 'Heading_1_Break' : 'Heading_1', 1, section.heading))

  // ІЧ (+ шкала) і фото поруч — розміри як у PDF
  const jpeg = file.thermogram.visibleJpeg
  const photoSize = jpeg ? jpegSize(jpeg) : null
  const gap = 14
  const irBoxW = photoSize ? (CONTENT_W - gap) / 2 : CONTENT_W * 0.72
  const maxH = photoSize ? 210 : 300
  let irW = irBoxW - 61
  if ((irW * ir.height) / ir.width > maxH) irW = (maxH * ir.width) / ir.height
  const factor = Math.max(1, Math.ceil((irW * RASTER_SCALE) / ir.width))
  const big = upscale(section.frame, ir.width, ir.height, factor)
  const frameHref = `data:image/png;base64,${base64(await encodePng(big.rgba, big.width, big.height))}`
  const barHref = `data:image/png;base64,${base64(await encodePng(paletteStrip(file.paletteId), 1, 256))}`
  const figure = irFigureSvg(section, ctx, { frameHref, barHref, width: irW, fontCss })
  const irFrame = pictures.frame(
    pictures.add(await rasterize(figure, RASTER_SCALE), 'png'),
    figure.width,
    figure.height,
  )
  if (photoSize && jpeg) {
    let photoW = irBoxW
    let photoH = (photoW * photoSize.height) / photoSize.width
    if (photoH > maxH) {
      photoH = maxH
      photoW = (photoH * photoSize.width) / photoSize.height
    }
    const name = `Figures${index + 1}`
    styles.push(tableStyles(name, [irBoxW + gap / 2, irBoxW + gap / 2]))
    const cell = (inner: string, caption: string) =>
      `<table:table-cell table:style-name="Cell_Plain" office:value-type="string">${p('Figure', inner)}${p('Small', inline(caption))}</table:table-cell>`
    out.push(
      `<table:table table:name="${name}" table:style-name="${name}">` +
        `<table:table-column table:style-name="${name}.C1"/><table:table-column table:style-name="${name}.C2"/>` +
        `<table:table-row>${cell(irFrame, section.imageCaption)}${cell(pictures.frame(pictures.add(jpeg, 'jpg'), photoW, photoH), t('report.photo'))}</table:table-row>` +
        '</table:table>',
    )
  } else {
    out.push(p('Figure', irFrame), p('Small', inline(section.imageCaption)))
  }

  out.push(h('Heading_2', 2, t('report.parameters')))
  const params = `Params${index + 1}`
  styles.push(tableStyles(params, PARAM_COLUMNS))
  out.push(table(params, null, section.params, true))
  if (section.changedParams) out.push(p('Small', inline(section.changedParams)))

  if (section.isotherms.length > 0) {
    out.push(h('Heading_2', 2, t('isotherm.section')))
    section.isotherms.forEach((iso, k) => {
      const style = `T_Iso${index + 1}_${k + 1}`
      styles.push(
        `<style:style style:name="${style}" style:family="text"><style:text-properties fo:color="${escapeXml(iso.color)}" fo:font-size="11pt"/></style:style>`,
      )
      out.push(p('Text', `<text:span text:style-name="${style}">■</text:span> ${inline(iso.text)}`))
    })
  }

  out.push(h('Heading_2', 2, t('report.results')))
  if (!section.resultsTable) {
    out.push(p('Muted', inline(t('report.noObjects'))))
  } else {
    const results = `Results${index + 1}`
    styles.push(tableStyles(results, RESULT_COLUMNS))
    out.push(table(results, section.resultsTable.header, section.resultsTable.rows, true))
    if (section.resultNotes) out.push(p('Small', inline(section.resultNotes)))
  }

  const chart = async (svg: Svg | null, empty: string) => {
    if (!svg) return p('Muted', inline(empty))
    return p(
      'Figure',
      pictures.frame(pictures.add(await rasterize(svg, RASTER_SCALE), 'png'), svg.width, svg.height),
    )
  }
  for (const pr of section.profiles) {
    out.push(h('Heading_2', 2, pr.title))
    out.push(await chart(profileSvg(pr.points, ctx, CONTENT_W, fontCss), '—'))
  }
  for (const d of section.distributions) {
    out.push(h('Heading_2', 2, d.title))
    out.push(
      await chart(distributionSvg(d.bins, file.paletteId, ctx, CONTENT_W, fontCss), t('distribution.noData')),
    )
  }

  if (section.comment) {
    out.push(h('Heading_2', 2, t('report.comment')))
    out.push(paragraphs('Text', section.comment))
  }
  if (section.cameraNote) {
    out.push(h('Heading_2', 2, t('info.note')))
    out.push(paragraphs('Text', section.cameraNote))
  }
  return out
}

function automaticStyles(): string {
  const cell = (name: string, extra = '') =>
    `<style:style style:name="${name}" style:family="table-cell"><style:table-cell-properties ` +
    `fo:padding="3pt" fo:border="0.5pt solid ${RULE}"${extra}/></style:style>`
  return (
    cell('Cell') +
    cell('Cell_Head', ' fo:background-color="#f2f2f2"') +
    '<style:style style:name="Cell_Plain" style:family="table-cell"><style:table-cell-properties fo:padding="0pt" fo:border="none"/></style:style>' +
    '<style:style style:name="T_Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>' +
    `<style:style style:name="T_Flag" style:family="text"><style:text-properties fo:color="${ACCENT}"/></style:style>` +
    `<style:style style:name="T_FlagBold" style:family="text"><style:text-properties fo:color="${ACCENT}" fo:font-weight="bold"/></style:style>` +
    '<style:style style:name="Image" style:family="graphic"><style:graphic-properties style:vertical-pos="top" ' +
    'style:vertical-rel="baseline" fo:border="none" fo:padding="0pt" style:wrap="none"/></style:style>'
  )
}

function stylesXml(meta: ReportMeta, { t }: ReportOptions, locale: string): string {
  const [lang, country] = locale === 'uk' ? ['uk', 'UA'] : ['en', 'GB']
  const para = (name: string, props: string, text: string, parent = 'Standard', extra = '') =>
    `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="${parent}"${extra}>` +
    `<style:paragraph-properties ${props}/><style:text-properties ${text}/></style:style>`
  const heading = (name: string, size: number, top: number, bottom: number, border: string, level: number) =>
    `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="Standard" ` +
    `style:next-style-name="Text" style:default-outline-level="${level}" style:class="text">` +
    `<style:paragraph-properties fo:margin-top="${top}pt" fo:margin-bottom="${bottom}pt" fo:keep-with-next="always"${border}/>` +
    `<style:text-properties fo:font-size="${size}pt" fo:font-weight="bold" fo:color="${ACCENT}"/></style:style>`
  // Колонтитул: ліворуч — застосунок і об'єкт, праворуч — «Сторінка N з M» (поля текстового процесора)
  const [before, afterN = ''] = t('report.page').split('{n}')
  const [between = '', after = ''] = afterN.split('{m}')
  const footer =
    `<text:p text:style-name="Footer">${inline(footerText(meta, t))}<text:tab/>${inline(before ?? '')}` +
    `<text:page-number text:select-page="current">1</text:page-number>${inline(between)}` +
    `<text:page-count>1</text:page-count>${inline(after)}</text:p>`
  return (
    XML +
    `<office:document-styles ${NS} office:version="1.3">` +
    '<office:font-face-decls><style:font-face style:name="Arial" svg:font-family="Arial" ' +
    'style:font-family-generic="swiss" style:font-pitch="variable"/></office:font-face-decls>' +
    '<office:styles>' +
    '<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0pt" fo:margin-bottom="0pt"/>' +
    `<style:text-properties style:font-name="Arial" fo:font-size="9pt" fo:color="${INK}" ` +
    `fo:language="${lang}" fo:country="${country}"/></style:default-style>` +
    '<style:default-style style:family="table"><style:table-properties table:border-model="collapsing"/></style:default-style>' +
    '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>' +
    para('Text', 'fo:margin-bottom="4pt" fo:line-height="130%"', '') +
    para('Muted', 'fo:margin-bottom="4pt"', `fo:color="${MUTED}"`) +
    para('Small', 'fo:margin-top="2pt" fo:margin-bottom="2pt"', `fo:font-size="7.5pt" fo:color="${MUTED}"`) +
    para('Figure', 'fo:margin-top="0pt" fo:margin-bottom="2pt"', '') +
    para('Signature', 'fo:margin-top="30pt"', '') +
    para('Table_Contents', '', '') +
    para('Table_Contents_Right', 'fo:text-align="end"', '', 'Table_Contents') +
    para('Table_Small', '', 'fo:font-size="8pt"') +
    para('Table_Small_Right', 'fo:text-align="end"', '', 'Table_Small') +
    para(
      'Report_Title',
      `fo:margin-bottom="10pt" fo:padding-bottom="4pt" fo:border-bottom="1.5pt solid ${ACCENT}"`,
      `fo:font-size="16pt" fo:font-weight="bold" fo:color="${ACCENT}"`,
    ) +
    heading('Heading_1', 12, 16, 8, ` fo:padding-bottom="3pt" fo:border-bottom="0.75pt solid ${RULE}"`, 1) +
    heading('Heading_2', 10, 10, 3, '', 2) +
    `<style:style style:name="Heading_1_Break" style:family="paragraph" style:parent-style-name="Heading_1" style:class="text">` +
    '<style:paragraph-properties fo:break-before="page" fo:margin-top="0pt"/></style:style>' +
    `<style:style style:name="Footer" style:family="paragraph" style:parent-style-name="Standard" style:class="extra">` +
    `<style:paragraph-properties fo:padding-top="3pt" fo:border-top="0.5pt solid ${RULE}">` +
    `<style:tab-stops><style:tab-stop style:position="${pt(CONTENT_W)}" style:type="right"/></style:tab-stops>` +
    `</style:paragraph-properties><style:text-properties fo:font-size="7.5pt" fo:color="${MUTED}"/></style:style>` +
    '</office:styles>' +
    '<office:automatic-styles><style:page-layout style:name="A4">' +
    `<style:page-layout-properties fo:page-width="${pt(PAGE_W)}" fo:page-height="${pt(PAGE_H)}" ` +
    `style:print-orientation="portrait" fo:margin-top="${pt(MARGIN)}" fo:margin-bottom="${pt(MARGIN - 18)}" ` +
    `fo:margin-left="${pt(MARGIN)}" fo:margin-right="${pt(MARGIN)}"/>` +
    '<style:footer-style><style:header-footer-properties fo:min-height="0pt" fo:margin-top="8pt"/></style:footer-style>' +
    '</style:page-layout></office:automatic-styles>' +
    `<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="A4">` +
    `<style:footer>${footer}</style:footer></style:master-page></office:master-styles>` +
    '</office:document-styles>'
  )
}

function metaXml(meta: ReportMeta, { t, locale }: ReportOptions): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, '')
  const author = meta.author.trim()
  return (
    XML +
    `<office:document-meta ${NS} office:version="1.3"><office:meta>` +
    `<meta:generator>${escapeXml(t('app.title'))}</meta:generator>` +
    `<dc:title>${escapeXml(documentTitle(meta, t))}</dc:title>` +
    (author
      ? `<meta:initial-creator>${escapeXml(author)}</meta:initial-creator><dc:creator>${escapeXml(author)}</dc:creator>`
      : '') +
    `<meta:creation-date>${now}</meta:creation-date><dc:date>${now}</dc:date>` +
    `<dc:language>${locale === 'uk' ? 'uk-UA' : 'en'}</dc:language>` +
    '</office:meta></office:document-meta>'
  )
}
