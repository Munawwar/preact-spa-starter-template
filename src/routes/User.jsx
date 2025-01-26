import useFetch from '~/useFetch';
import styles from './User.module.css';

/**
 * @template {'/user/:id'} T
 * @param {import('@/Route').PageComponentProps<T>} props
 */
function User(props) {
  const { data, error, loading } = useFetch(
    '/api/test',
    {},
    {
      refetchable: true,
      urlMapPromise: props.prefetchUrlsPromise,
    },
  );
  console.log(data, error, loading);
  return (
    <div class={styles.root}>
      <h1 style={{ textAlign: 'center' }}>You are viewing the {props.title} Page</h1>

      <p>":id" param from URL path = "{props.params.id}"</p>

      <h2>Check out other pages</h2>
      <p>
        <a href="/">Home Page</a>
      </p>
      <p>
        <a href="/this-url-does-not-exist">404 Page</a>
      </p>
      <p>
        <a href="/error">Error Page</a>
      </p>
    </div>
  );
}
export default User;
