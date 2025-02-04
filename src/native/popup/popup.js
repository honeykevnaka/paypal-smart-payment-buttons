/* @flow */

import { parseQuery, cleanup, stringifyErrorMessage, base64encode, isSFVC, isSFVCorSafari } from '@krakenjs/belter/src';
import { onCloseWindow } from '@krakenjs/cross-domain-utils/src';
import { ZalgoPromise } from '@krakenjs/zalgo-promise/src';
import { ENV, FUNDING, FPTI_KEY, COUNTRY } from '@paypal/sdk-constants/src';

import type { LocaleType } from '../../types';
import { FPTI_CONTEXT_TYPE, FPTI_CUSTOM_KEY, FPTI_TRANSITION } from '../../constants';
import {  isAppInstalled, setupNativeLogger } from '../lib';
import { isIOSSafari, getStorageID, getPostRobot, getSDKVersion } from '../../lib';

import { MESSAGE, HASH, EVENT } from './constants';

export type NativePopupOptions = {|
    parentDomain : string,
    env : $Values<typeof ENV>,
    sessionID : string,
    buttonSessionID : string,
    sdkCorrelationID : string,
    clientID : string,
    fundingSource : $Values<typeof FUNDING>,
    locale : LocaleType,
    buyerCountry : $Values<typeof COUNTRY>
|};

type NativePopup = {|
    destroy : () => ZalgoPromise<void>
|};

export function setupNativePopup({ parentDomain, env, sessionID, buttonSessionID, sdkCorrelationID,
    clientID, fundingSource, locale, buyerCountry } : NativePopupOptions) : NativePopup {

    const sdkVersion = getSDKVersion();

    const logger = setupNativeLogger({ env, sessionID, buttonSessionID, sdkCorrelationID,
        clientID, fundingSource, sdkVersion, locale, buyerCountry });

    const initQueryString = window.location.search.slice(1);
    const { venmoWebEnabled = false, venmoWebUrl } = parseQuery(initQueryString);
    if (venmoWebEnabled && venmoWebUrl) {
        logger.info('native_venmo_web_redirect', {
            buttonSessionID,
        }).track({
            [FPTI_KEY.TRANSITION]:      FPTI_TRANSITION.NATIVE_VENMO_WEB_REDIRECT,
        }).flush();
        
        return window.location.replace(venmoWebUrl + window.location.search);
    }

    logger.info('native_popup_init', {
        buttonSessionID,
        href: base64encode(window.location.href)
    }).track({
        [FPTI_KEY.TRANSITION]:      FPTI_TRANSITION.NATIVE_POPUP_INIT,
        [FPTI_CUSTOM_KEY.INFO_MSG]: base64encode(window.location.href)
    }).flush();

    const appInstalledPromise = isAppInstalled({ fundingSource, env })
        .catch(err => {
            logger.info('native_popup_android_app_installed_error')
                .track({
                    [FPTI_KEY.TRANSITION]:      FPTI_TRANSITION.NATIVE_POPUP_ANDROID_APP_ERROR,
                    [FPTI_CUSTOM_KEY.ERR_DESC]: `Error: ${ stringifyErrorMessage(err) }`
                }).flush();
            
            return ZalgoPromise.resolve(null);
        });

    let sfvc = isSFVC();
    const sfvcOrSafari = !sfvc ? isSFVCorSafari() : false;
    const sfvcOrSafariLog = sfvcOrSafari ? 'sfvcOrSafari' : 'browser';
    const logMessage = sfvc ? 'sfvc' : sfvcOrSafariLog;

    if (isIOSSafari()) {
        const height = window.innerHeight;
        const scale = Math.round(window.screen.width / window.innerWidth * 100) / 100;
        const computedHeight = Math.round(height * scale);

        const log = `${ FPTI_TRANSITION.NATIVE_POPUP_INIT }_${ logMessage }`;
        logger
            .info(log)
            .track({
                [FPTI_KEY.TRANSITION]:      log,
                [FPTI_CUSTOM_KEY.INFO_MSG]: `computed height: ${ computedHeight }, height: ${ window.outerHeight }, width: ${ window.outerWidth }, innerHeight: ${ height }, scale: ${ scale }`
            }).flush();
    }

    window.addEventListener('beforeunload', () => {
        logger.info('native_popup_beforeunload')
            .track({
                [FPTI_KEY.TRANSITION]: FPTI_TRANSITION.NATIVE_POPUP_BEFORE_UNLOAD
            }).flush();
    });

    window.addEventListener('unload', () => {
        logger.info('native_popup_unload')
            .track({
                [FPTI_KEY.TRANSITION]: FPTI_TRANSITION.NATIVE_POPUP_UNLOAD
            }).flush();
    });

    window.addEventListener('pagehide', () => {
        logger.info('native_popup_pagehide')
            .track({
                [FPTI_KEY.TRANSITION]: FPTI_TRANSITION.NATIVE_POPUP_PAGEHIDE
            }).flush();
    });

    const replaceHash = (hash) => {
        return window.location.replace(
            `#${ hash.replace(/^#/, '') }`
        );
    };

    const closeWindow = () => {
        window.close();
        replaceHash(HASH.CLOSED);
    };

    const getRawHash = () => {
        return (window.location.hash || 'none').replace(/^#/, '').replace(/\?.+/, '');
    };

    const opener = window.opener;
    if (!opener) {
        if (isIOSSafari()) {
            const log = `${ FPTI_TRANSITION.NATIVE_POPUP_NO_OPENER }_hash_${ getRawHash() }_${ logMessage }`;
            logger
                .info(log)
                .track({
                    [FPTI_KEY.TRANSITION]: log
                }).flush();
        }

        logger.info('native_popup_no_opener', {
            buttonSessionID,
            href: base64encode(window.location.href)
        }).info(`native_popup_no_opener_hash_${ getRawHash() }`).track({
            [FPTI_KEY.TRANSITION]:      `${ FPTI_TRANSITION.NATIVE_POPUP_NO_OPENER }_hash_${ getRawHash() }`,
            [FPTI_CUSTOM_KEY.INFO_MSG]: `location: ${ base64encode(window.location.href) }`
        }).flush().then(closeWindow);
        

        throw new Error(`Expected window to have opener`);
    } else {
        onCloseWindow(window.opener, () => {
            logger.info(`native_popup_opener_detect_close`).track({
                [FPTI_KEY.TRANSITION]:  FPTI_TRANSITION.NATIVE_POPUP_OPENER_DETECT_CLOSE
            }).flush().then(closeWindow);
        }, 500);
    }

    const clean = cleanup();
    const postRobot = getPostRobot();

    const destroy = () => {
        return clean.all();
    };

    const sendToParent = (event, payload = {}) => {
        return postRobot.send(opener, event, payload, { domain: parentDomain })
            .then(({ data }) => data);
    };

    const handleHash = () => {
        if (!window.location.hash || window.location.hash === '#') {
            return;
        }

        const hashString = window.location.hash && window.location.hash.slice(1);
        const [ hash, queryString ] = hashString.split('?');

        switch (hash) {
        case HASH.INIT: {
            break;
        }
        case HASH.LOADED: {
            break;
        }
        case HASH.APPSWITCH: {
            break;
        }
        case HASH.WEBSWITCH: {
            break;
        }
        case HASH.CLOSED: {
            break;
        }
        case HASH.ON_APPROVE: {
            const { payerID, paymentID, billingToken } = parseQuery(queryString);
            sendToParent(MESSAGE.ON_APPROVE, { payerID, paymentID, billingToken }).finally(closeWindow);
            break;
        }
        case HASH.ON_CANCEL: {
            sendToParent(MESSAGE.ON_CANCEL).finally(closeWindow);
            break;
        }
        case HASH.ON_FALLBACK: {
            const { type, skip_native_duration, fallback_reason } = parseQuery(queryString);
            sendToParent(MESSAGE.ON_FALLBACK, { type, skip_native_duration, fallback_reason });
            break;
        }
        case HASH.ON_ERROR: {
            const { message } = parseQuery(queryString);
            sendToParent(MESSAGE.ON_ERROR, { message }).finally(closeWindow);
            break;
        }
        case HASH.CLOSE: {
            sendToParent(MESSAGE.ON_COMPLETE).finally(closeWindow);
            break;
        }
        case HASH.TEST: {
            break;
        }
        default: {
            sendToParent(MESSAGE.ON_ERROR, {
                message: `Invalid event sent from native, ${ hash }, from URL, ${ window.location.href }`
            }).finally(closeWindow);
        }
        }
    };

    window.addEventListener(EVENT.HASHCHANGE, handleHash);
    clean.register(() => window.removeEventListener(EVENT.HASHCHANGE, handleHash));

    replaceHash(HASH.LOADED);
    handleHash();

    const stickinessID = getStorageID();
    const pageUrl = `${ window.location.href.split('#')[0] }#${  HASH.CLOSE }`;

    appInstalledPromise.then(app => {
        sfvc = !sfvc ? sfvcOrSafari === true : true;
        sendToParent(MESSAGE.AWAIT_REDIRECT, { app, pageUrl, sfvc, stickinessID }).then(({ redirect = true, redirectUrl, orderID, appSwitch = true }) => {
            if (!redirect) {
                return;
            }

            if (orderID) {
                logger.addTrackingBuilder(() => {
                    return {
                        [FPTI_KEY.CONTEXT_TYPE]: FPTI_CONTEXT_TYPE.ORDER_ID,
                        [FPTI_KEY.CONTEXT_ID]:   orderID,
                        [FPTI_KEY.TOKEN]:        orderID
                    };
                });
            }

            replaceHash(appSwitch ? HASH.APPSWITCH : HASH.WEBSWITCH);
            window.location.replace(redirectUrl);

            let didRedirect = false;

            const markRedirect = () => {
                didRedirect = true;
            };

            window.addEventListener('beforeunload', markRedirect);
            clean.register(() => window.removeEventListener('beforeunload', markRedirect));

            window.addEventListener('unload', markRedirect);
            clean.register(() => window.removeEventListener('unload', markRedirect));

            window.addEventListener('pagehide', markRedirect);
            clean.register(() => window.removeEventListener('pagehide', markRedirect));

            if (appSwitch) {
                const timer = setTimeout(() => {
                    if (!didRedirect) {
                        sendToParent(MESSAGE.DETECT_POSSIBLE_APP_SWITCH);
                    }
                }, 1500);
                clean.register(() => clearTimeout(timer));
            }
        });
    });

    return {
        destroy
    };
}
