/**
 * @fileoverview Validates if the HTML of a page is AMP valid
 */

import * as amphtmlValidator from 'amphtml-validator';

import { Category } from 'sonarwhal/dist/src/lib/enums/category';
import { debug as d } from 'sonarwhal/dist/src/lib/utils/debug';
import { IRule, RuleMetadata, FetchEnd } from 'sonarwhal/dist/src/lib/types';
import { RuleContext } from 'sonarwhal/dist/src/lib/rule-context';
import { RuleScope } from 'sonarwhal/dist/src/lib/enums/rulescope';

const debug: debug.IDebugger = d(__filename);

/*
 * ------------------------------------------------------------------------------
 * Public
 * ------------------------------------------------------------------------------
 */

export default class AmpValidatorRule implements IRule {
    public static readonly meta: RuleMetadata = {
        docs: {
            category: Category.performance,
            description: `Require HTML page to be AMP valid.`
        },
        id: 'amp-validator',
        schema: [{
            additionalProperties: false,
            properties: { 'errors-only': { type: 'boolean' } },
            type: 'object'
        }],
        scope: RuleScope.any
    }

    public constructor(context: RuleContext) {
        let validPromise;
        const errorsOnly = context.ruleOptions && context.ruleOptions['errors-only'] || false;
        let events: Array<FetchEnd> = [];

        const onFetchEndHTML = (fetchEnd: FetchEnd) => {
            const { response: { body: { content }, statusCode } } = fetchEnd;

            if (statusCode !== 200 || !content) {
                return;
            }

            // events has to be an array in order to work with the local connector.
            events.push(fetchEnd);
            validPromise = amphtmlValidator.getInstance();
        };

        const onScanEnd = async () => {
            if (!events || events.length === 0) {
                debug('No valid content');

                return;
            }

            for (const event of events) {
                const { resource, response: { body: { content } } } = event;
                const validator = await validPromise;
                const result = validator.validateString(content);

                for (let i = 0; i < result.errors.length; i++) {
                    const error = result.errors[i];
                    let message = error.message;

                    if (error.specUrl !== null) {
                        message += ` (${error.specUrl})`;
                    }

                    // We ignore errors that are not 'ERROR' if user has configured the rule like that
                    if (errorsOnly && error.severity !== 'ERROR') {
                        debug(`AMP error doesn't meet threshold for reporting`);
                    } else {
                        await context.report(resource, null, message, null, { column: error.column, line: error.line });
                    }
                }
            }

            // clear events for watcher.
            events = [];
        };

        context.on('fetch::end::html', onFetchEndHTML);
        context.on('scan::end', onScanEnd);
    }
}
