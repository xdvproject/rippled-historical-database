'use strict';

var Logger = require('../../lib/logger');
var log = new Logger({scope: 'reports'});
var smoment = require('../../lib/smoment');
var utils = require('../../lib/utils');
var hbase = require('../../lib/hbase')

/**
 * Reports
 */

var Reports = function (req, res, next) {
  var options = prepareOptions();

  if (options.error) {
    errorResponse(options);
    return;

  } else {
    log.info(options.start.format(), '-', options.end.format());

    hbase.getAggregateAccountPayments(options)
    .nodeify(function(err, resp) {
      if (err) {
        errorResponse(err);
      } else {

        resp.rows.forEach(function(row) {

          // return the count only
          if (!options.accounts) {
            row.receiving_counterparties = row.receiving_counterparties.length;
            row.sending_counterparties   = row.sending_counterparties.length;
          }

          // convert amount to string
          if (options.payments) {
            row.payments.forEach(function(p) {
              p.amount = p.amount.toString();
            });

          // delete the payments array
          } else {
            delete row.payments;
          }

          row.high_value_received = row.high_value_received.toString();
          row.high_value_sent = row.high_value_sent.toString();
          row.total_value_received = row.total_value_received.toString();
          row.total_value_sent = row.total_value_sent.toString();
          row.total_value = row.total_value.toString();
        });

        successResponse(resp);
      }
    });
  }

  /**
   * prepareOptions
   */

  function prepareOptions() {
    var options = {
      start: smoment(req.params.date),
      end: smoment(req.params.date),
      accounts: (/true/i).test(req.query.accounts) ? true : false,
      payments: (/true/i).test(req.query.payments) ? true : false,
      limit: Number(req.query.limit || 200),
      marker: req.query.marker,
      format: (req.query.format || 'json').toLowerCase()
    };

    if (!options.accounts) {
      options.accounts = (/true/i).test(req.query.counterparties) ? true : false;
    }

    if (!options.start) {
      return {error: 'invalid date format', code: 400};
    }

    if (isNaN(options.limit)) {
      options.limit = 200;

    } else if (options.limit > 1000) {
      options.limit = 1000;
    }

    options.start.moment.startOf('day');
    options.end.granularity = 'second';

    return options;
  }

  /**
  * errorResponse
  * return an error response
  * @param {Object} err
  */

  function errorResponse(err) {
    log.error(err.error || err);
    if (err.code && err.code.toString()[0] === '4') {
      res.status(err.code).json({
        result: 'error',
        message: err.error
      });
    } else {
      res.status(500).json({
        result: 'error',
        message: 'unable to retrieve payments'
      });
    }
  }

  /**
  * successResponse
  * return a successful response
  * @param {Object} payments
  */

  function successResponse(resp) {
    var filename = 'account reports';

    if (resp.marker) {
      utils.addLinkHeader(req, res, resp.marker);
    }

    if (options.format === 'csv') {
      if (options.accounts) {
        resp.rows.forEach(function(r) {
          r.sending_counterparties = r.sending_counterparties.join(', ');
          r.receiving_counterparties = r.receiving_counterparties.join(', ');
        });
      }

      filename += ' ' + options.start.format('YYYY-MM-DD');
      // if (options.end && end.diff(start.add(1, 'day')) > 0) {
      //   filename += ' - ' + end.format('YYYY-MM-DD');
      // }
      res.csv(resp.rows, filename + '.csv');

    } else {
      res.json({
        result: 'success',
        date: options.start.format(),
        count: resp.rows.length,
        marker: resp.marker,
        reports: resp.rows
      });
    }
  }
};

module.exports = Reports
