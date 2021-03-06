import fs from 'fs';
import FileSystemUtils from '../utils/FileSystemUtils';
import AlphaVantageService from './AlphaVantageService';
import HgBrasilService from './HgBrasilService';
import ConfigurationService from './ConfigurationService';

const FILES = {
    STOCK_PRICES: 'stock_prices'
};

class StockPriceService {

    async getStockPrices() {
        const rootPath = await FileSystemUtils.getDataPath();
        const path = `${rootPath}/${FILES.STOCK_PRICES}`;

        const stockPrices = JSON.parse((await fs.promises.readFile(path, { flag: 'a+', encoding: 'utf-8' })).toString() || '{}');
        Object.values(stockPrices).forEach(price => {
            price.lastTradingDay = new Date(price.lastTradingDay);
            price.lastUpdated = new Date(price.lastUpdated);
        });
        return stockPrices;
    }

    async saveStockPrices(stockPrices) {
        const rootPath = await FileSystemUtils.getDataPath();
        const path = `${rootPath}/${FILES.STOCK_PRICES}`;
        await fs.promises.writeFile(path, JSON.stringify(stockPrices));
    }

    async updateStockPrice(code, stockPrice) {
        const stockPrices = await this.getStockPrices();
        stockPrices[code] = stockPrice;
        await this.saveStockPrices(stockPrices);
    }

    async autoUpdateStockPrices(stocks) {
        const configuration = await ConfigurationService.getConfiguration();
        let updateApi = 'alpha-vantage';
        if (configuration && configuration.priceUpdate && configuration.priceUpdate.updatePriceApi)
            updateApi = configuration.priceUpdate.updatePriceApi;

        console.log(`[STOCK PRICE SERVICE] Updating stocks using ${updateApi}: ${stocks.join(', ')}...`);

        const promises = updateApi === 'alpha-vantage'
            ? stocks.map(s => AlphaVantageService.getLastValue(s))
            : stocks.map(s => HgBrasilService.getLastValue(s));

        const results = (await Promise.all(promises)).filter(o => o !== null);

        const stockPrices = await this.getStockPrices();
        const now = new Date();

        for (const r of results) {
            if (r.status !== 'success') continue;

            stockPrices[r.code] = {
                price: r.price,
                changePrice: r.changePrice,
                changePercent: r.changePercent,
                apiUpdate: r.apiUpdate,
                lastUpdated: now
            };
            r.lastUpdated = now;
        }

        await this.saveStockPrices(stockPrices);

        return results;
    }

    async updateStockPricesConfiguration(stocks) {
        const stockPrices = await this.getStockPrices();
        stockPrices.forEach(o => { o.shouldUpdate = false }); // Set everything to false

        // Set the ones to true
        stocks.forEach(s => {
            const stockPrice = stockPrices.filter(o => o.code === s)[0] || {
                code: s,
                shouldUpdate: true
            };
            stockPrice.shouldUpdate = true;
        });

        await this.saveStockPrices(stockPrices);
    }

    async saveStockPricesConfiguration(stocks) {
        const stockPrices = await this.getStockPrices();

        // Deleting the ones that should be deleted
        Object.keys(stockPrices).forEach(code => {
            if (stocks.indexOf(code) === -1)
                delete stockPrices[code];
        });

        // Adding the new ones
        const now = new Date();
        stocks.forEach(code => {
            if (!stockPrices[code])
                stockPrices[code] = {
                    price: 0,
                    changePrice: 0,
                    changePercent: 0,
                    lastTradingDay: now,
                    lastUpdated: now
                };
        });

        await this.saveStockPrices(stockPrices);
    }

    async deleteStockPrice(code) {
        const stockPrices = await this.getStockPrices();
        delete stockPrices[code];
        this.saveStockPrices(stockPrices);
    }

    async addStockPrice(stockPrice) {
        const stockPrices = await this.getStockPrices();
        stockPrices[stockPrice.code] = {
            price: stockPrice.price,
            changePrice: Math.round((stockPrice.price * (stockPrice.changePercent / 100)) * 100) / 100,
            changePercent: stockPrice.changePercent,
            lastTradingDay: new Date(),
            lastUpdated: new Date()
        };
        this.saveStockPrices(stockPrices);

        const result = {};
        result[stockPrice.code] = stockPrices[stockPrice.code];
        return result;
    }

}

export default new StockPriceService();
export { FILES as StockPriceFiles };
