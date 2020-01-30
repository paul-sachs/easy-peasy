import reduxThunk from 'redux-thunk';
import { modelVisitorResults, thunkOnSymbol } from '../../constants';
import isPromise from '../../lib/is-promise';
import get from '../../lib/get';
import set from '../../lib/set';

function createThunkHandler(thunkDefinition, meta, references, injections) {
  const thunkMeta = thunkDefinition[thunkOnSymbol];
  const helpers = {
    getState: () => get(meta.parentPath, references.getState()),
    getStoreActions: () => references.internals.actionCreators,
    injections,
    meta: {
      key: meta.key,
      parent: meta.parentPath,
      path: meta.path,
    },
  };
  return payload => {
    helpers.dispatch = references.dispatch;
    helpers.getStoreState = references.getState;
    if (thunkMeta.resolvedTargets) {
      payload.resolvedTargets = [...thunkMeta.resolvedTargets];
    }
    return thunkDefinition(
      get(meta.parentPath, references.internals.actionCreators),
      payload,
      helpers,
    );
  };
}

function createThunkActionsCreator(
  thunkDefinition,
  meta,
  references,
  thunkHandler,
) {
  const type = `@thunkOn.${meta.path.join('.')}`;
  const startType = `${type}(start)`;
  const successType = `${type}(success)`;
  const failType = `${type}(fail)`;

  const thunkMeta = thunkDefinition[thunkOnSymbol];
  thunkMeta.type = type;
  thunkMeta.actionName = meta.key;
  thunkMeta.parent = meta.parentPath;
  thunkMeta.path = meta.path;

  const actionCreator = payload => {
    const dispatchError = err => {
      references.dispatch({
        type: failType,
        payload,
        error: err,
      });
      references.dispatch({
        type,
        payload,
        error: err,
      });
    };
    const dispatchSuccess = result => {
      references.dispatch({
        type: successType,
        payload,
        result,
      });
      references.dispatch({
        type,
        payload,
        result,
      });
    };

    references.dispatch({
      type: startType,
      payload,
    });
    try {
      const result = references.dispatch(() => thunkHandler(payload));
      if (isPromise(result)) {
        return result
          .then(resolved => {
            dispatchSuccess(resolved);
            return resolved;
          })
          .catch(err => {
            dispatchError(err);
            throw err;
          });
      }
      dispatchSuccess(result);
      return result;
    } catch (err) {
      dispatchError(err);
      throw err;
    }
  };

  actionCreator.type = type;
  actionCreator.startType = startType;
  actionCreator.successType = successType;
  actionCreator.failType = failType;

  return actionCreator;
}

function thunkOnPlugin(config, references) {
  const { injections } = config;

  return {
    middleware: [reduxThunk],
    storeEnhancer: store => store,
    modelVisitor: (value, key, meta) => {
      if (
        value != null &&
        typeof value === 'function' &&
        value[thunkOnSymbol]
      ) {
        const { path } = meta;
        const thunkHandler = createThunkHandler(
          value,
          meta,
          references,
          injections,
        );
        const actionCreator = createThunkActionsCreator(
          value,
          meta,
          references,
          thunkHandler,
        );
        references.internals.actionCreatorDict[
          actionCreator.type
        ] = actionCreator;

        references.pluginsState.listener.listenerDefinitions.push(value);
        set(
          path,
          references.pluginsState.listener.listenerActionCreators,
          actionCreator,
        );

        return modelVisitorResults.CONTINUE;
      }
      return undefined;
    },
    onStoreCreated: () => {},
  };
}

thunkOnPlugin.pluginName = 'thunk-on';

export default thunkOnPlugin;