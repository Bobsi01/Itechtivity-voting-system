import { z } from 'zod';

export const RegistrationBindSchema = z.object({
  buyerType: z.enum(['CSD_STUDENT', 'NON_CSD_STUDENT', 'VISITOR', 'ALUMNI']),
  buyerName: z.string().trim().min(2).max(150),
  studentNumber: z.string().trim().max(80).nullish(),
  program: z.string().trim().max(150).nullish(),
  yearAndSection: z.string().trim().max(40).nullish(),
  affiliation: z.string().trim().max(200).nullish(),
  contactInfo: z.string().trim().max(200).nullish(),
  cardSerials: z.array(z.string().trim().min(3).max(100)).min(1).max(200),
}).transform((data) => {

  const isStudent = data.buyerType === 'CSD_STUDENT' || data.buyerType === 'NON_CSD_STUDENT';
  return {
    ...data,
    studentNumber: isStudent ? data.studentNumber : null,
    program: isStudent ? data.program : null,
    yearAndSection: isStudent ? data.yearAndSection : null,
    affiliation: data.buyerType === 'VISITOR' ? data.affiliation : null,
  };
});
