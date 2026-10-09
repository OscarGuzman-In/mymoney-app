import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { category_type } from '../src/generated/prisma/client';

interface SeedCurrency {
  code: string;
  name: string;
  symbol: string;
}

const CURRENCIES: SeedCurrency[] = [
  { code: 'ARS', name: 'Peso argentino', symbol: '$' },
  { code: 'BRL', name: 'Real brasileño', symbol: 'R$' },
  { code: 'CLP', name: 'Peso chileno', symbol: '$' },
  { code: 'COP', name: 'Peso colombiano', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GTQ', name: 'Quetzal guatemalteco', symbol: 'Q' },
  { code: 'MXN', name: 'Peso mexicano', symbol: '$' },
  { code: 'PEN', name: 'Sol peruano', symbol: 'S/' },
  { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
];

interface SeedCategory {
  name: string;
  type: category_type;
  description: string;
  color: string;
  icon: string;
}

const EXPENSE_CATEGORIES: SeedCategory[] = [
  {
    name: 'Alimentación',
    type: category_type.expense,
    description: 'Comida, supermercado y restaurantes',
    color: '#f97316',
    icon: '🍽️',
  },
  {
    name: 'Vivienda',
    type: category_type.expense,
    description: 'Renta, hipoteca y mantenimiento del hogar',
    color: '#0ea5e9',
    icon: '🏠',
  },
  {
    name: 'Transporte',
    type: category_type.expense,
    description: 'Combustible, transporte público y vehículo',
    color: '#6366f1',
    icon: '🚌',
  },
  {
    name: 'Salud',
    type: category_type.expense,
    description: 'Medicinas, consultas y seguros de salud',
    color: '#ef4444',
    icon: '🩺',
  },
  {
    name: 'Educación',
    type: category_type.expense,
    description: 'Colegiatura, cursos y materiales de estudio',
    color: '#8b5cf6',
    icon: '🎓',
  },
  {
    name: 'Entretenimiento',
    type: category_type.expense,
    description: 'Ocio, suscripciones y actividades recreativas',
    color: '#ec4899',
    icon: '🎬',
  },
  {
    name: 'Compras',
    type: category_type.expense,
    description: 'Ropa, tecnología y artículos personales',
    color: '#14b8a6',
    icon: '🛍️',
  },
  {
    name: 'Servicios',
    type: category_type.expense,
    description: 'Luz, agua, internet, telefonía y otros servicios',
    color: '#64748b',
    icon: '🔌',
  },
  {
    name: 'Otros gastos',
    type: category_type.expense,
    description: 'Gastos que no encajan en otra categoría',
    color: '#94a3b8',
    icon: '📦',
  },
];

const INCOME_CATEGORIES: SeedCategory[] = [
  {
    name: 'Salario',
    type: category_type.income,
    description: 'Sueldo o salario periódico',
    color: '#15803d',
    icon: '💼',
  },
  {
    name: 'Freelance',
    type: category_type.income,
    description: 'Trabajos independientes y por proyecto',
    color: '#0f766e',
    icon: '🧰',
  },
  {
    name: 'Negocio',
    type: category_type.income,
    description: 'Ingresos de un negocio propio',
    color: '#b45309',
    icon: '🏪',
  },
  {
    name: 'Inversiones',
    type: category_type.income,
    description: 'Rendimientos, dividendos e intereses',
    color: '#7c3aed',
    icon: '📈',
  },
  {
    name: 'Regalos',
    type: category_type.income,
    description: 'Dinero recibido como regalo o apoyo',
    color: '#db2777',
    icon: '🎁',
  },
  {
    name: 'Otros ingresos',
    type: category_type.income,
    description: 'Ingresos que no encajan en otra categoría',
    color: '#0ea5e9',
    icon: '➕',
  },
];

async function main(): Promise<void> {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
  });
  const prisma = new PrismaClient({ adapter });

  const seededCurrencies: string[] = [];
  let createdCategories = 0;
  try {
    for (const currency of CURRENCIES) {
      const row = await prisma.currency.upsert({
        where: { code: currency.code },
        update: {
          name: currency.name,
          symbol: currency.symbol,
          is_active: true,
        },
        create: {
          code: currency.code,
          name: currency.name,
          symbol: currency.symbol,
        },
      });
      seededCurrencies.push(row.code);
    }

    for (const category of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      const existing = await prisma.category.findFirst({
        where: {
          user_id: null,
          type: category.type,
          name: category.name,
        },
      });

      if (existing) {
        await prisma.category.update({
          where: { id: existing.id },
          data: {
            description: category.description,
            color: category.color,
            icon: category.icon,
            is_active: true,
          },
        });
        continue;
      }

      await prisma.category.create({
        data: {
          user_id: null,
          name: category.name,
          type: category.type,
          description: category.description,
          color: category.color,
          icon: category.icon,
        },
      });
      createdCategories += 1;
    }

    console.log(
      `Monedas inicializadas (idempotente): ${seededCurrencies.join(', ')} (${seededCurrencies.length})`,
    );
    console.log(
      `Categorías del sistema inicializadas (idempotente): ${createdCategories} nuevas, ${EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length} en total`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('No se pudieron inicializar los datos base:', error);
  process.exit(1);
});
