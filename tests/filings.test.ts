import { describe, expect, it } from 'vitest';
import {
  ICP_FILING_DEFAULT_LINK,
  extractPoliceFilingCode,
  resolveIcpFilingLink,
  resolvePoliceFilingLink
} from '../src/lib/filings';

describe('filing link helpers', () => {
  it('takes the longest digit run of the police filing number as the query code', () => {
    expect(extractPoliceFilingCode('皖公网安备12345602000000号')).toBe('12345602000000');
    expect(extractPoliceFilingCode('皖公网安备 12345602000000 号')).toBe('12345602000000');
    expect(extractPoliceFilingCode('皖公网安备12345号')).toBeNull();
    expect(extractPoliceFilingCode('')).toBeNull();
    expect(extractPoliceFilingCode(null)).toBeNull();
  });

  it('falls back to the official ICP link', () => {
    expect(resolveIcpFilingLink(null)).toBe(ICP_FILING_DEFAULT_LINK);
    expect(resolveIcpFilingLink('  ')).toBe(ICP_FILING_DEFAULT_LINK);
    expect(resolveIcpFilingLink('https://beian.miit.gov.cn/#/Integrated/index')).toBe(
      'https://beian.miit.gov.cn/#/Integrated/index'
    );
  });

  it('prefers the platform link and otherwise builds the police query link', () => {
    expect(resolvePoliceFilingLink('皖公网安备12345602000000号', null)).toBe(
      'https://beian.mps.gov.cn/#/query/webSearch?code=12345602000000'
    );
    expect(
      resolvePoliceFilingLink('皖公网安备12345602000000号', 'https://beian.mps.gov.cn/#/query/webSearch?code=1')
    ).toBe('https://beian.mps.gov.cn/#/query/webSearch?code=1');
    expect(resolvePoliceFilingLink('皖公网安备12345号', null)).toBeNull();
    expect(resolvePoliceFilingLink(null, null)).toBeNull();
  });
});
