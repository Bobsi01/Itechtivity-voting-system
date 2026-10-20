import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Itechtivity 2027 database seeding...');

  // 1. Initialize Event Configuration
  const eventConfig = await prisma.eventConfig.upsert({
    where: { id: 'default-config' },
    update: {},
    create: {
      id: 'default-config',
      eventName: 'Itechtivity 2027',
      isAwardsLocked: false,
      maxAwards: 6,
      isVotingOpen: true,
      isRegistrationOpen: true,
    },
  });
  console.log('Event configuration initialized:', eventConfig.eventName);

  // 2. Initialize 6 Default Award Slots matching the card design
  const awardsData = [
    { slotNumber: 1, title: "People's Choice", description: "Voted by attendees as the overall crowd favorite." },
    { slotNumber: 2, title: "Dream Team", description: "Recognizing outstanding team collaboration and synergy." },
    { slotNumber: 3, title: "Most Aesthetic Booth", description: "Excellence in visual design and physical exhibition booth presence." },
    { slotNumber: 4, title: "Best Interactive Demonstration", description: "Most engaging hands-on demonstration and audience experience." },
    { slotNumber: 5, title: "Best Software Product", description: "Exemplary code architecture, UX, and software engineering quality." },
    { slotNumber: 6, title: "Best Innovation", description: "Highest technological novelty and research impact." },
  ];

  for (const award of awardsData) {
    await prisma.award.upsert({
      where: { slotNumber: award.slotNumber },
      update: { title: award.title, description: award.description },
      create: award,
    });
  }
  console.log('Seeded 6 Award Slots.');

  // 3. Initialize Default Academic Programs (BSCS, BSIT, BSIS, BSEMC)
  const defaultPrograms = [
    { code: 'BSCS', name: 'BS in Computer Science', order: 1 },
    { code: 'BSIT', name: 'BS in Information Technology', order: 2 },
    { code: 'BSIS', name: 'BS in Information Systems', order: 3 },
    { code: 'BSEMC', name: 'BS in Entertainment and Multimedia Computing', order: 4 },
  ];

  for (const prog of defaultPrograms) {
    await prisma.academicProgram.upsert({
      where: { code: prog.code },
      update: { name: prog.name, order: prog.order, isActive: true },
      create: { ...prog, isActive: true },
    });
  }
  console.log('Seeded 4 Default Academic Programs.');

  // 4. Initialize 40 Capstone Booths (CS-01 to CS-40)
  const boothTemplates = [
    { code: 'CS-01', title: 'AgriSense IoT Smart Hydroponics', category: 'IoT & Smart Agriculture' },
    { code: 'CS-02', title: 'JuanCharge EV Charging Network', category: 'Green Tech & Energy' },
    { code: 'CS-03', title: 'GalawGo Neuro-Motor Rehab Game', category: 'HealthTech & Serious Games' },
    { code: 'CS-04', title: 'MarketAid MSME Supply Chain Analytics', category: 'Enterprise & Fintech' },
    { code: 'CS-05', title: 'Luntayod Drone Forest Reforestation', category: 'Environmental Tech' },
    { code: 'CS-06', title: 'AkBike Smart Commuter Tracker', category: 'Urban Mobility' },
    { code: 'CS-07', title: 'MeshGrow Automated Mushroom Farming', category: 'Bio-Computing' },
    { code: 'CS-08', title: 'AquaSense Community Water Purifier', category: 'CleanTech' },
    { code: 'CS-09', title: 'Sentinela Disaster Early Warning Audio AI', category: 'AI & Public Safety' },
    { code: 'CS-10', title: 'SariSari Store Micro-POS Terminal', category: 'Micro-Commerce' },
  ];

  const allBooths = [];
  for (let i = 1; i <= 40; i++) {
    const code = `CS-${i.toString().padStart(2, '0')}`;
    const template = boothTemplates[(i - 1) % boothTemplates.length];
    allBooths.push({
      code,
      projectTitle: i <= 10 ? template.title : `${template.title} Batch ${Math.ceil(i / 10)}`,
      capstoneCategory: template.category,
      tableNumber: `Booth-${i}`,
      teamMembers: 'CSD Senior Capstone Team',
    });
  }

  for (const booth of allBooths) {
    await prisma.booth.upsert({
      where: { code: booth.code },
      update: { projectTitle: booth.projectTitle, capstoneCategory: booth.capstoneCategory },
      create: booth,
    });
  }
  console.log('Seeded 40 Capstone Booths.');

  // 4. Initialize Test User Accounts with Bcrypt Hashed Passwords
  const passwordAdmin = await bcrypt.hash('AdminPass2027!', 10);
  const passwordProd = await bcrypt.hash('ProdPass2027!', 10);
  const passwordReg = await bcrypt.hash('RegPass2027!', 10);
  const passwordBooth = await bcrypt.hash('BoothPass2027!', 10);

  const booth1 = await prisma.booth.findUnique({ where: { code: 'CS-01' } });
  const booth2 = await prisma.booth.findUnique({ where: { code: 'CS-02' } });

  const users = [
    {
      email: 'admin@itech2027.edu',
      fullName: 'System Administrator',
      passwordHash: passwordAdmin,
      role: Role.ADMIN,
    },
    {
      email: 'prod@itech2027.edu',
      fullName: 'Production Printing Officer',
      passwordHash: passwordProd,
      role: Role.PRODUCTION,
    },
    {
      email: 'reg.desk1@itech2027.edu',
      fullName: 'Registration Desk Officer 1',
      passwordHash: passwordReg,
      role: Role.REGISTRATION,
    },
    {
      email: 'booth.cs01@itech2027.edu',
      fullName: 'AgriSense Booth Lead',
      passwordHash: passwordBooth,
      role: Role.EXHIBITOR,
      boothId: booth1?.id,
    },
    {
      email: 'booth.cs02@itech2027.edu',
      fullName: 'JuanCharge Booth Lead',
      passwordHash: passwordBooth,
      role: Role.EXHIBITOR,
      boothId: booth2?.id,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash: user.passwordHash, role: user.role, boothId: user.boothId },
      create: user,
    });
  }
  console.log('Seeded User Accounts for all roles.');
  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
