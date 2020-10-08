/* eslint-disable no-param-reassign */
/* eslint-disable no-return-assign */
import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Cliente não encontrado.');
    }

    const productsOrder = await this.productsRepository.findAllById(products);

    if (!productsOrder.length) {
      throw new AppError('Produto não encontrado.');
    }

    const productsIds = productsOrder.map(product => product.id);

    const message = productsIds.reduce(
      (accumulator, id) => `${(accumulator += id)} / `,
      `Produto(s) não encontrado(s): `,
    );

    const checkInexistentProducts = products.filter(({ id }) => {
      return !productsIds.includes(id);
    });

    if (checkInexistentProducts.length) {
      throw new AppError(message);
    }

    const findProductsWithNoQuantityAvailable = products.filter(
      product =>
        productsOrder.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    if (findProductsWithNoQuantityAvailable.length) {
      throw new AppError('Quantidade indisponível.');
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: productsOrder.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        productsOrder.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
