/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { parseContactsCsv, parseVCards } from "../email-inbox/contact-import";

test("parseVCards reads ORG as the contact's company", () => {
  const contacts = parseVCards(
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:John Smith",
      "N:Smith;John;;;",
      "ORG:NueraHeat;Field Services",
      "EMAIL;TYPE=WORK:John@NueraHeat.com",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:No Company",
      "EMAIL:solo@example.com",
      "END:VCARD",
    ].join("\r\n"),
  );

  assert.equal(contacts.length, 2);
  // Only the company survives; the department after the ';' is dropped.
  assert.equal(contacts[0].company, "NueraHeat");
  assert.equal(contacts[0].email, "john@nueraheat.com");
  assert.equal(contacts[1].company, null);
});

test("parseContactsCsv picks up a Company/Organization column", () => {
  const withCompany = parseContactsCsv(
    ["Name,E-mail Address,Company", "John Smith,john@nueraheat.com,NueraHeat"].join(
      "\n",
    ),
  );
  assert.equal(withCompany[0].company, "NueraHeat");

  const withOrganization = parseContactsCsv(
    [
      "Name,E-mail Address,Organization",
      "John Smith,john@nueraheat.com,NueraHeat",
    ].join("\n"),
  );
  assert.equal(withOrganization[0].company, "NueraHeat");

  // No company column at all: the field is simply absent, not a blank string.
  const withoutCompany = parseContactsCsv(
    ["Name,E-mail Address", "John Smith,john@nueraheat.com"].join("\n"),
  );
  assert.equal(withoutCompany[0].company, null);
});
