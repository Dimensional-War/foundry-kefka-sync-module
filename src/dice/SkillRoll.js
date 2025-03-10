import { SkillDieTerm } from "./SkillDieTerm";

export class SkillRoll extends Roll {
  /**
   * Classify a remaining string term into a recognized RollTerm class
   * @param {string} term         A remaining un-classified string
   * @param {object} [options={}] Options which customize classification
   * @param {boolean} [options.intermediate=true]  Allow intermediate terms
   * @param {RollTerm|string} [options.prior]       The prior classified term
   * @param {RollTerm|string} [options.next]        The next term to classify
   * @returns {RollTerm}          A classified RollTerm instance
   * @internal
   */
  static _classifyStringTerm(term, { intermediate = true, prior, next } = {}) {
    // Terms already classified
    if (term instanceof RollTerm) return term;

    // Numeric terms
    const numericMatch = NumericTerm.matchTerm(term);
    if (numericMatch) return NumericTerm.fromMatch(numericMatch);

    const skillDiceMatch = SkillDieTerm.matchTerm(term, {
      imputeNumber: !intermediate
    });
    if (skillDiceMatch) {
      if (intermediate && (prior?.isIntermediate || next?.isIntermediate))
        return new StringTerm({ term });
      return SkillDieTerm.fromMatch(skillDiceMatch);
    }

    return super._classifyStringTerm(term, { intermediate, prior, next });
  }
}
