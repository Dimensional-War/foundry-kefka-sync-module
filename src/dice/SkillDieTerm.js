const { DiceTerm } = CONFIG.Dice.termTypes;

export class SkillDieTerm extends DiceTerm {
  constructor({
    number = 1,
    faces = 1,
    modifiers = [],
    results = [],
    options = {}
  }) {
    super({ number, faces, modifiers, results, options });
  }

  /**
   * Define the denomination string used to register this DiceTerm type in CONFIG.Dice.terms
   * @type {string}
   */
  static DENOMINATION = "";

  /** @inheritdoc */
  static REGEXP = new RegExp(
    `^([1-9]\\d*)?([sS])(\\d+)${SkillDieTerm.MODIFIERS_REGEXP_STRING}?${SkillDieTerm.FLAVOR_REGEXP_STRING}?$`
  );

  /** @inheritdoc */
  get expression() {
    const x =
      this.constructor.DENOMINATION === "d"
        ? this.faces
        : this.constructor.DENOMINATION;
    return `${this.number}s${x}${this.modifiers.join("")}`;
  }

  /**
   * Construct a term of this type given a matched regular expression array.
   * @param {RegExpMatchArray} match          The matched regular expression array
   * @return {DiceTerm}                      The constructed term
   */
  static fromMatch(match) {
    let [number, denomination, modifiers, flavor] = match.slice(1);

    // Get the denomination of DiceTerm
    denomination = denomination.toLowerCase();
    const cls =
      denomination in CONFIG.Dice.terms
        ? CONFIG.Dice.terms[denomination]
        : CONFIG.Dice.terms.d;
    if (!foundry.utils.isSubclass(cls, DiceTerm)) {
      throw new Error(
        `DiceTerm denomination ${denomination} not registered to CONFIG.Dice.terms as a valid DiceTerm class`
      );
    }

    // Get the term arguments
    number = Number.isNumeric(number) ? parseInt(number) : 1;
    let faces = Number.isNumeric(denomination) ? parseInt(denomination) : null;

    if (denomination === "s") {
      let skillDie = 40;
      // 0-1:40 2-3:60 4-5:90 6-7:140 8-9:220 10:350 11-:375
      if (faces >= 2 && faces <= 3) {
        skillDie = 60;
      } else if (faces >= 4 && faces <= 5) {
        skillDie = 90;
      } else if (faces >= 6 && faces <= 7) {
        skillDie = 140;
      } else if (faces >= 8 && faces <= 9) {
        skillDie = 220;
      } else if (faces === 10) {
        skillDie = 350;
      } else if (faces > 10) {
        skillDie = 375;
      }

      faces = skillDie;
    }

    // Match modifiers
    modifiers = Array.from(
      (modifiers || "").matchAll(DiceTerm.MODIFIER_REGEXP)
    ).map(m => m[0]);

    // Construct a term of the appropriate denomination
    return new cls({ number, faces, modifiers, options: { flavor } });
  }
}
