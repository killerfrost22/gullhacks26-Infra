import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { htmlToPage, normalizeForMatch } from './html.js';
import {
  findEmails,
  findPhoneDigits,
  formatPhone,
  isAcceptableContactEmail,
  isOfficialHost,
  isRejectedMailbox,
  isRepairInbox,
  modelNamedHostAllowed,
  phoneDigits,
  sameOfficeDomain,
  trustedCampusHost,
} from './provenance.js';

describe('isOfficialHost', () => {
  it('counts government, university, military, and U.S. state/locality domains', () => {
    for (const host of [
      'www.collegeparkmd.gov',
      'roads.maryland.gov',
      'facilities.umd.edu',
      'www.army.mil',
      'mdot.state.md.us',
      'www.ci.springfield.il.us',
      'www.gov.uk',
      'www.toronto.gc.ca',
      'www.ox.ac.uk',
    ]) {
      assert.equal(isOfficialHost(host), true, host);
    }
  });

  it('does not count commercial or look-alike hosts', () => {
    for (const host of ['seeclickfix.com', 'gov.example.com', 'mygov.org', 'edu-news.com', 'springfield.il.us.example.com']) {
      assert.equal(isOfficialHost(host), false, host);
    }
  });
});

describe('modelNamedHostAllowed', () => {
  const rules = { searchHosts: new Set(['www.pepco.com']), campusHost: 'www.campus.example.org' };
  it('allows official hosts, hosts search returned, and the campus website', () => {
    assert.equal(modelNamedHostAllowed('dpw.city.gov', rules), true);
    assert.equal(modelNamedHostAllowed('pepco.com', rules), true);
    assert.equal(modelNamedHostAllowed('facilities.campus.example.org', rules), true);
  });
  it('drops other hosts', () => {
    assert.equal(modelNamedHostAllowed('random-blog.com', rules), false);
  });
});

describe('mailbox rules', () => {
  it('accepts shared repair and service inboxes', () => {
    for (const email of ['streetmaintenance@city.gov', 'dpw@county.gov', '311@city.gov', 'roads.service@state.md.us']) {
      assert.equal(isRepairInbox(email), true, email);
    }
  });

  it('rejects personal, press, media, HR, jobs, webmaster, web, admin, and no-reply addresses', () => {
    for (const email of [
      'john.smith@city.gov',
      'press@city.gov',
      'mediarelations@city.gov',
      'hr@city.gov',
      'jobs@city.gov',
      'careers@city.gov',
      'webmaster@city.gov',
      'web@city.gov',
      'admin@city.gov',
      'noreply@city.gov',
    ]) {
      assert.equal(isRejectedMailbox(email), true, email);
      assert.equal(isRepairInbox(email), false, email);
    }
  });

  it('treats an office host, its subdomains, and its parent as one office, but not sibling agencies', () => {
    assert.equal(sameOfficeDomain('dpw.city.gov', 'www.city.gov'), true);
    assert.equal(sameOfficeDomain('city.gov', 'dpw.city.gov'), true);
    assert.equal(sameOfficeDomain('mdot.state.md.us', 'www.mdot.state.md.us'), true);
    assert.equal(sameOfficeDomain('dmv.ny.gov', 'dot.ny.gov'), false);
    assert.equal(sameOfficeDomain('mde.state.md.us', 'mdot.state.md.us'), false);
    assert.equal(sameOfficeDomain('othercity.gov', 'city.gov'), false);
  });

  it('matches repair words per word of the address, not inside names', () => {
    assert.equal(isRepairInbox('brian.broadwell@city.gov'), false);
    assert.equal(isRepairInbox('roads.maint@city.gov'), true);
  });

  it('lets a model-named email through only as a repair/service or general office inbox', () => {
    for (const email of ['streetmaintenance@town.gov', 'info@town.gov', 'contact@town.gov', 'customerservice@town.gov']) {
      assert.equal(isAcceptableContactEmail(email), true, email);
    }
    for (const email of ['jsmith@town.gov', 'john.q.smith@town.gov', 'john.smith@town.gov', 'j.streeter@town.gov', 'press@town.gov']) {
      assert.equal(isAcceptableContactEmail(email), false, email);
    }
  });
});

describe('campus website trust', () => {
  it('trusts a campus site root on its own host only', () => {
    assert.equal(trustedCampusHost('https://www.umd.edu/'), 'www.umd.edu');
    assert.equal(trustedCampusHost('https://www.campus.example.org'), 'www.campus.example.org');
  });
  it('ignores shared platforms and deep links', () => {
    for (const url of [
      'https://www.facebook.com/somecollege',
      'https://www.facebook.com/',
      'https://sites.google.com/',
      'https://college.wixsite.com/',
      'https://linktr.ee/',
      'https://x.com/',
      'https://www.college.edu/about/',
      'not a url',
    ]) {
      assert.equal(trustedCampusHost(url), null, url);
    }
  });
});

describe('scanning hostile page text', () => {
  it('processes a 2 MB pathological page in well under a second', () => {
    const letters = 'a'.repeat(2 * 1024 * 1024);
    const started = performance.now();
    findEmails(letters);
    findEmails(`${'a.'.repeat(1024 * 1024)}@`);
    findPhoneDigits('1 '.repeat(1024 * 1024));
    htmlToPage('<!--'.repeat(512 * 1024));
    htmlToPage('<a'.repeat(1024 * 1024));
    htmlToPage(`<script>${'<'.repeat(2 * 1024 * 1024)}`);
    htmlToPage(letters);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 1000, `took ${Math.round(elapsed)} ms`);
  });

  it('still reads text and titles and skips comments and scripts', () => {
    const page = htmlToPage(
      '<!DOCTYPE html><html><head><title>Roads &amp; Streets</title></head><body><!-- hidden --><p>Call 311</p>' +
        '<SCRIPT>var a = "x@y.gov"</SCRIPT><div>a < b</div></body></html>',
    );
    assert.equal(page.title, 'Roads & Streets');
    assert.equal(page.text, 'Call 311\na < b');
  });
});

describe('matching helpers', () => {
  it('normalizes whitespace, nbsp, soft hyphens, curly quotes, dashes, and case', () => {
    assert.equal(
      normalizeForMatch('The\u00a0County\u2019s  Depart\u00admen\u00adt maintains \u201cRoute\u00a01\u201d \u2014 not\nthe CITY'),
      normalizeForMatch("the county's department maintains \"route 1\" - not the city"),
    );
  });

  it('compares phone numbers by digits and shows them rebuilt from digits', () => {
    assert.equal(phoneDigits('+1 (301) 555-0100'), phoneDigits('301.555.0100'));
    assert.equal(formatPhone('+1 301.555.0100'), '(301) 555-0100');
    assert.equal(formatPhone('311'), '311');
  });
});
