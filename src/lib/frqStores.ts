export const FRQ_TEMPLATE_COLLECTION = "frq-templates";
export const FRQ_GRADABLE_SUBMISSIONS_COLLECTION = "frq-submissions-gradable";
export const FRQ_GRADED_SUBMISSIONS_COLLECTION = "frq-submissions-graded";

export const getFrqTemplateId = (
  subject: string,
  unitId: string,
  frqId: string,
) => `${subject}__${unitId}__${frqId}`;
