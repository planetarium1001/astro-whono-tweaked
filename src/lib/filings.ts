// 备案信息的链接与编号规则：ICP 备案号固定链接工信部备案管理系统首页；
// 公安备案号按「省简称 + 公网安备 + 6 位属地码 + 02 + 6 位顺序码」拼查询链接。

export const ICP_FILING_DEFAULT_LINK = 'https://beian.miit.gov.cn/';
export const POLICE_FILING_QUERY_PREFIX = 'https://beian.mps.gov.cn/#/query/webSearch?code=';

/** 公安备案号里 6 位属地码起算，短于该长度的数字串不视为编号 */
const POLICE_FILING_CODE_RE = /\d{6,}/g;

/** 取备案号里最长的数字串作为查询编号；取不到时返回 null */
export const extractPoliceFilingCode = (number: string | null | undefined): string | null => {
  if (!number) return null;
  const matches = number.match(POLICE_FILING_CODE_RE);
  if (!matches?.length) return null;
  return matches.reduce((longest, current) => (current.length > longest.length ? current : longest));
};

/** ICP 备案号链接：留空时用工信部备案管理系统首页 */
export const resolveIcpFilingLink = (link: string | null | undefined): string =>
  link?.trim() || ICP_FILING_DEFAULT_LINK;

/** 公安备案号链接：优先用平台给出的地址，缺失时按编号拼查询链接；都拿不到则返回 null */
export const resolvePoliceFilingLink = (
  number: string | null | undefined,
  link: string | null | undefined
): string | null => {
  const explicit = link?.trim();
  if (explicit) return explicit;
  const code = extractPoliceFilingCode(number);
  return code ? `${POLICE_FILING_QUERY_PREFIX}${code}` : null;
};
